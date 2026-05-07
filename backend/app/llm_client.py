import os
import httpx
from typing import Any, Dict

from app.config import settings


def call_mistral(prompt: str, model: str | None = None, temperature: float = 0.0) -> str:
    api_key = (
        settings.llm_api_key
        or settings.openai_api_key
        or os.environ.get("LLM_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
    )
    if not api_key:
        raise RuntimeError(
            "An LLM API key is required. Set LLM_API_KEY or OPENAI_API_KEY in the environment or .env."
        )

    if not settings.llm_base_url:
        raise RuntimeError("LLM_BASE_URL is required for Mistral provider.")

    url = f"{settings.llm_base_url.rstrip('/')}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model or settings.llm_model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
    }

    with httpx.Client(timeout=60.0) as client:
        response = client.post(url, json=body, headers=headers)
        response.raise_for_status()
        data = response.json()

    choices = data.get("choices") or []
    if choices:
        first = choices[0]
        message = first.get("message") or {}
        if isinstance(message, dict) and message.get("content"):
            return message["content"].strip()

    return response.text.strip()


def call_llm(prompt: str, temperature: float = 0.0, max_tokens: int = 1200) -> str:
    provider = settings.llm_provider.lower()
    if provider == "mistral":
        return call_mistral(prompt, temperature=temperature)

    try:
        import openai
    except ImportError as exc:
        raise RuntimeError(
            "OpenAI support requires the openai package. Install it with pip install openai"
        ) from exc

    api_key = (
        settings.openai_api_key
        or settings.llm_api_key
        or os.environ.get("OPENAI_API_KEY")
        or os.environ.get("LLM_API_KEY")
    )
    if not api_key:
        raise RuntimeError(
            "An LLM API key is required. Set LLM_API_KEY or OPENAI_API_KEY in the environment or .env."
        )

    openai.api_key = api_key
    response = openai.ChatCompletion.create(
        model=settings.llm_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content.strip()


def format_llm_json_response(raw_text: str) -> str:
    return raw_text
