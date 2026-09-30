/**
 * STRATA API Client
 * Clean REST and SSE streaming interface to FastAPI backend
 */

export async function fetchMaterials(filters = {}) {
  const params = new URLSearchParams();
  if (filters.cat && filters.cat !== 'all') params.append('cat', filters.cat);
  if (filters.q) params.append('q', filters.q);
  if (filters.matrix !== undefined) params.append('matrix', filters.matrix);
  if (filters.reinf !== undefined) params.append('reinf', filters.reinf);

  const url = `/api/v1/materials${params.toString() ? '?' + params.toString() : ''}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch materials (${resp.status})`);
  return await resp.json();
}

export async function fetchMaterial(id) {
  const resp = await fetch(`/api/v1/materials/${encodeURIComponent(id)}`);
  if (!resp.ok) throw new Error(`Material ${id} not found`);
  return await resp.json();
}

export async function fetchHardeners(matrixId) {
  const resp = await fetch(`/api/v1/hardeners/by-matrix/${encodeURIComponent(matrixId)}`);
  if (!resp.ok) return [];
  return await resp.json();
}

export async function calculateComposite(requestPayload) {
  const resp = await fetch('/api/v1/composite/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestPayload)
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `Calculation failed (${resp.status})`);
  }
  return await resp.json();
}

export async function saveFormulation(title, matrixId, hardenerId, reinforcements) {
  const resp = await fetch('/api/v1/formulations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      matrix_id: matrixId,
      hardener_id: hardenerId,
      reinforcements
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to save recipe (${resp.status})`);
  }
  return await resp.json();
}

export function exportFormulationUrl(id, format = 'csv') {
  return `/api/v1/formulations/${encodeURIComponent(id)}/export?format=${format}`;
}

export async function streamChat(messages, forgeContext, onToken, onComplete, onError) {
  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({ messages, forgeContext })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `Server error ${resp.status}` }));
      onError(err.error || `HTTP ${resp.status}`);
      return;
    }

    const contentType = resp.headers.get('content-type') || '';

    // If server returned plain JSON (e.g. offline fallback)
    if (contentType.includes('application/json')) {
      const data = await resp.json();
      if (data.error) onError(data.error);
      else {
        onToken(data.text);
        onComplete();
      }
      return;
    }

    // Server-Sent Events stream reader
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep partial line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') {
          onComplete();
          return;
        }
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            onError(parsed.error);
            return;
          }
          if (parsed.token) {
            onToken(parsed.token);
          }
        } catch (e) {
          // Ignore JSON parse errors for incomplete chunks
        }
      }
    }
    onComplete();
  } catch (err) {
    onError(err.message || 'Network error occurred');
  }
}

