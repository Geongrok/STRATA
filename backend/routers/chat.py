import json
import logging
import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse

from backend.config import OPENROUTER_API_KEY, OPENROUTER_URL, DEFAULT_MODEL
from backend.schemas import ChatRequest

router = APIRouter(prefix="/api", tags=["AI Chat"])
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are STRATA AI, an expert composite materials scientist and engineer embedded in the STRATA Composite Compendium — an interactive engineering platform for designing, analyzing, and qualifying composite materials.

Your role:
1. Suggest optimal matrix + reinforcement + hardener combinations for specific engineering requirements (aerospace structural load, marine corrosion, high-temperature service, ballistic impact, cost, mass minimization).
2. Explain composite micromechanics and formulas (Halpin-Tsai homogenization, Classical Laminate Theory off-axis transformation, Kelly-Tyson strain compatibility, Nicolais-Narkis stress concentration, Rosen microbuckling, Schapery CTE bounds, Hashin-Shtrikman conductivity).
3. Recommend authoritative ASTM / SACMA / ISO testing standards and test matrices (ASTM D3039 tensile, ASTM D6641 CLC compression, ASTM D7264 flexure, ASTM D3518 in-plane shear, ASTM D2344 short-beam shear ILSS, ASTM E1640 DMA Tg, ASTM D3171 void content).
4. Interpret the computed properties shown in the Forge (stiffness tensor, failure modes, percolation, thermal limits) and explain their practical engineering implications.
5. Flag manufacturing and thermodynamic compatibility issues (e.g. process temperature exceeding reinforcement degradation threshold, moisture absorption and environmental conditioning per ASTM D5229, galvanic corrosion between carbon and aluminum, fiber packing limits).

Keep responses technically rigorous, concise (2-4 paragraphs), and practical. Use standard engineering units (GPa, MPa, g/cm³, W/m·K, °C). Reference specific materials and ASTM standards from the STRATA database.
"""


def _prepare_messages(chat_req: ChatRequest):
    system_text = SYSTEM_PROMPT
    if chat_req.forgeContext:
        system_text += f"\n\nCURRENT FORGE STATE (what the user is actively analyzing in the 3D Forge):\n{chat_req.forgeContext}"

    api_messages = [{"role": "system", "content": system_text}]

    # Clean and append user/model messages
    recent_messages = chat_req.messages[-20:]
    for msg in recent_messages:
        role = "assistant" if msg.role in ("assistant", "model") else "user"
        content = ""
        if msg.content:
            content = msg.content
        elif msg.parts:
            content = "\n".join(p.text for p in msg.parts if p.text)

        if content.strip():
            api_messages.append({"role": role, "content": content.strip()[:2000]})

    return api_messages


@router.post("/chat")
async def chat_endpoint(chat_req: ChatRequest, request: Request):
    if not OPENROUTER_API_KEY:
        # Graceful fallback message if API key is not configured in local environment
        return JSONResponse(
            status_code=200,
            content={
                "text": (
                    "STRATA AI is currently in offline mode (OPENROUTER_API_KEY is not configured in this environment). "
                    "You can set your `OPENROUTER_API_KEY` environment variable to enable live generative responses from "
                    "Gemini / OpenRouter models. All physics calculations, 3D laminate visualization, and ASTM standards "
                    "generation remain fully operational!"
                )
            }
        )

    api_messages = _prepare_messages(chat_req)
    payload = {
        "model": DEFAULT_MODEL,
        "messages": api_messages,
        "temperature": 0.65,
        "max_tokens": 1024,
        "stream": True
    }

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://strata.engineering",
        "X-Title": "STRATA Composite Compendium"
    }

    # If client accepts text/event-stream, return SSE streaming
    client_accepts_sse = "text/event-stream" in request.headers.get("accept", "")

    async def sse_generator():
        client = httpx.AsyncClient(timeout=60.0)
        try:
            async with client.stream("POST", OPENROUTER_URL, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    yield f"data: {json.dumps({'error': f'AI Service Error ({response.status_code}): {err_body.decode()[:300]}'})}\n\n"
                    return

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            yield "data: [DONE]\n\n"
                            break
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if delta:
                                yield f"data: {json.dumps({'token': delta})}\n\n"
                        except Exception:
                            continue
        except Exception as e:
            logger.exception("Error in AI streaming")
            yield f"data: {json.dumps({'error': f'Streaming connection error: {str(e)}'})}\n\n"
        finally:
            await client.aclose()

    if client_accepts_sse:
        return StreamingResponse(sse_generator(), media_type="text/event-stream")

    # Non-streaming fallback for simple REST clients
    payload["stream"] = False
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(OPENROUTER_URL, headers=headers, json=payload)
            if response.status_code != 200:
                return JSONResponse(status_code=502, content={"error": f"OpenRouter returned {response.status_code}: {response.text[:300]}"})
            result = response.json()
            text = result["choices"][0]["message"]["content"]
            return JSONResponse(content={"text": text})
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": f"Connection error: {str(e)}"})

