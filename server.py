from flask import Flask, request, jsonify, send_from_directory
import os
import requests as req

app = Flask(__name__)

# ============================================================
# OPENROUTER CONFIGURATION
# ============================================================

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MODEL = "stealth/ox-alpha"


# ============================================================
# STRATA AI SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """You are STRATA AI, an expert composite materials scientist and engineer embedded in the STRATA Composite Compendium — an interactive tool for designing and analysing composite materials.

Your role:
1. Suggest optimal matrix + reinforcement + hardener combinations for user requirements (load, environment, weight, cost, temperature)
2. Explain composite properties, micromechanics, and formulas (rule of mixtures, Halpin-Tsai, Schapery bounds, Kelly-Tyson, Rosen microbuckling, etc.)
3. Answer questions about any material — elements, alloys, ceramics, natural/synthetic fibres, polymers, nano-fillers
4. Interpret the computed properties shown in the Forge and explain what they mean in practical engineering terms
5. Flag compatibility issues, manufacturing considerations, or real-world limitations (cure temperature vs. reinforcement stability, moisture sensitivity, percolation thresholds, etc.)

Available materials in STRATA (54 total):
Elements: Aluminum, Iron, Titanium, Copper, Carbon (graphite), Silicon, Magnesium, Nickel, Zinc, Tungsten
Metals/Alloys: Mild Steel, Stainless Steel 304, Ti-6Al-4V, Aluminium Alloy 6061, Brass, Bronze, Inconel 718
Ceramics: Alumina, Silicon Carbide, Silicon Nitride, Soda-Lime Glass, Boron Carbide
Natural Fibres: Cotton, Jute, Hemp, Flax, Bamboo, Silk, Wool, Basalt
Synthetic Fibres: Carbon Fibre, E-Glass Fibre, Aramid (Kevlar-type), UHMWPE (Dyneema-type), Boron Fibre
Natural Polymers: Natural Rubber, Cellulose nanofibril, Lignin, Shellac, Chitin
Synthetic Polymers: Epoxy Resin, Unsaturated Polyester, Vinyl Ester, Polypropylene, Nylon 6, PEEK, Phenolic Resin, Polyurethane, Silicone Rubber
Nano/Particulate Fillers: Graphene, Carbon Nanotubes, Fumed Silica, Calcium Carbonate, Nanoclay

Key property ranges to keep in mind when making suggestions:
- Structural aerospace: E > 50 GPa, specific stiffness > 20 GPa·cm³/g, density < 2 g/cm³
- Marine: chemical resistance excellent, moisture sensitivity low-medium
- High-temperature (>300°C): PEEK, phenolic, ceramic, or metal matrix required
- Ballistic/impact: Aramid or UHMWPE fibre, tough matrix (epoxy/polyurethane)

Keep responses concise (2-4 paragraphs), technically precise, and practical. Use proper units (GPa, MPa, g/cm³, °C). When suggesting materials, reference specific names from the STRATA database above. Avoid excessive bullet points — prefer clear prose with key numbers called out inline. If the user's forge state is provided, ground your answer in those specific numbers.
"""


# ============================================================
# FRONTEND ROUTES
# ============================================================

@app.route("/")
@app.route("/strata.html")
def index():
    return send_from_directory(".", "strata.html")


# ============================================================
# AI CHAT API
# ============================================================

@app.route("/api/chat", methods=["POST"])
def chat():

    # --------------------------------------------------------
    # Check API key
    # --------------------------------------------------------

    if not OPENROUTER_API_KEY:
        return jsonify({
            "error": "OPENROUTER_API_KEY not set on server."
        }), 500

    # --------------------------------------------------------
    # Read incoming request
    # --------------------------------------------------------

    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({
            "error": "Invalid JSON request."
        }), 400

    if not isinstance(data, dict):
        return jsonify({
            "error": "Invalid request format."
        }), 400

    messages = data.get("messages", [])
    forge_context = data.get("forgeContext", "")

    if not isinstance(messages, list):
        messages = []

    # --------------------------------------------------------
    # Limit conversation size
    # --------------------------------------------------------

    messages = messages[-30:]

    cleaned_messages = []

    for message in messages:

        if not isinstance(message, dict):
            continue

        role = message.get("role", "user")

        # Only allow valid OpenAI/OpenRouter roles
        if role not in ("user", "assistant"):
            role = "user"

        parts = message.get("parts", [])

        if not isinstance(parts, list):
            continue

        text_parts = []

        for part in parts:

            if isinstance(part, dict):
                text = str(
                    part.get("text", "")
                )[:2000]

                if text:
                    text_parts.append(text)

        combined_text = "\n".join(text_parts)

        if combined_text:
            cleaned_messages.append({
                "role": role,
                "content": combined_text
            })

    # --------------------------------------------------------
    # Forge context
    # --------------------------------------------------------

    forge_context = str(forge_context)[:2000]

    system_text = SYSTEM_PROMPT

    if forge_context:

        system_text += (
            "\n\nCURRENT FORGE STATE "
            "(what the user is actively working on):\n"
            + forge_context
        )

    # --------------------------------------------------------
    # Build OpenRouter messages
    # --------------------------------------------------------

    api_messages = [
        {
            "role": "system",
            "content": system_text
        }
    ]

    api_messages.extend(cleaned_messages)

    # --------------------------------------------------------
    # OpenRouter request payload
    # --------------------------------------------------------

    payload = {
        "model": MODEL,
        "messages": api_messages,
        "temperature": 0.65,
        "max_tokens": 1024
    }

    # --------------------------------------------------------
    # Send request to OpenRouter
    # --------------------------------------------------------

    try:

        response = req.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",

                # Optional OpenRouter metadata
                "HTTP-Referer": "https://strata.onrender.com",
                "X-Title": "STRATA Composite Compendium"
            },
            json=payload,
            timeout=60
        )

        # ----------------------------------------------------
        # Handle OpenRouter errors
        # ----------------------------------------------------

        if response.status_code != 200:

            app.logger.error(
                "OpenRouter error: %s %s",
                response.status_code,
                response.text
            )

            try:

                error_data = response.json()

                error_object = error_data.get(
                    "error",
                    {}
                )

                if isinstance(error_object, dict):

                    error_message = error_object.get(
                        "message",
                        "Unknown OpenRouter error"
                    )

                else:

                    error_message = str(
                        error_object
                    )

            except Exception:

                error_message = response.text[:500]

            return jsonify({
                "error": (
                    f"OpenRouter error "
                    f"({response.status_code}): "
                    f"{error_message}"
                )
            }), 502

        # ----------------------------------------------------
        # Parse successful response
        # ----------------------------------------------------

        try:

            result = response.json()

            text = result[
                "choices"
            ][0][
                "message"
            ][
                "content"
            ]

        except (KeyError, IndexError, TypeError):

            app.logger.error(
                "Unexpected OpenRouter response: %s",
                response.text
            )

            return jsonify({
                "error": (
                    "AI service returned an "
                    "unexpected response."
                )
            }), 500

        # ----------------------------------------------------
        # Return response to STRATA frontend
        # ----------------------------------------------------

        return jsonify({
            "text": text
        })

    # --------------------------------------------------------
    # Network / connection errors
    # --------------------------------------------------------

    except req.exceptions.Timeout:

        app.logger.error(
            "OpenRouter request timed out."
        )

        return jsonify({
            "error": (
                "The AI service took too long "
                "to respond. Please try again."
            )
        }), 504

    except req.exceptions.RequestException as e:

        app.logger.error(
            "OpenRouter connection error: %s",
            str(e)
        )

        return jsonify({
            "error": (
                "Could not connect to the AI service."
            )
        }), 502

    except Exception as e:

        app.logger.exception(
            "Unexpected server error: %s",
            str(e)
        )

        return jsonify({
            "error": "An unexpected server error occurred."
        }), 500


# ============================================================
# LOCAL DEVELOPMENT SERVER
# ============================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=int(
            os.environ.get(
                "PORT",
                5000
            )
        ),
        debug=False
    )