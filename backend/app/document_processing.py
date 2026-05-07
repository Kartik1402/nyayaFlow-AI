import re
from typing import Any, Dict, List

from pydantic import BaseModel

from app.utils import normalize_text_whitespace, split_text_into_chunks


class DocumentProcessingResult(BaseModel):
    title: str
    raw_text: str
    cleaned_text: str
    chunks: List[Dict[str, Any]]
    content_type: str


def extract_text_from_pdf(raw_bytes: bytes) -> List[str]:
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("PyMuPDF is required to extract PDF text. Install it with pip install pymupdf") from exc

    pdf = fitz.open(stream=raw_bytes, filetype="pdf")
    pages: List[str] = []
    for page in pdf:
        text = page.get_text("text")
        if not text.strip():
            blocks = page.get_text("blocks")
            text = "\n".join(
                str(block[4]).strip()
                for block in blocks
                if isinstance(block, (list, tuple)) and len(block) >= 5 and str(block[4]).strip()
            )
        if not text.strip():
            words = page.get_text("words")
            text = " ".join(
                str(word[4]).strip()
                for word in words
                if isinstance(word, (list, tuple)) and len(word) >= 5 and str(word[4]).strip()
            )
        if not text.strip():
            try:
                import pytesseract
                from PIL import Image
            except ImportError:
                text = ""
            else:
                pix = page.get_pixmap(alpha=False)
                image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                text = pytesseract.image_to_string(image, lang="eng")
        pages.append(text)
    return pages


def clean_text(raw_text: str, use_cleaning: bool = False) -> str:
    text = normalize_text_whitespace(raw_text)
    if not use_cleaning:
        return text

    return text


def process_document(
    raw_bytes: bytes,
    filename: str,
    content_type: str,
    use_cleaning: bool = False,
    min_chunk_chars: int = 500,
    max_chunk_chars: int = 1000,
) -> DocumentProcessingResult:
    normalized_content_type = (content_type or "").lower()
    if "pdf" in normalized_content_type:
        pages = extract_text_from_pdf(raw_bytes)
    elif filename.lower().endswith(".pdf"):
        pages = extract_text_from_pdf(raw_bytes)
    else:
        pages = [raw_bytes.decode("utf-8", errors="ignore")]

    cleaned_pages = [clean_text(page, use_cleaning=use_cleaning) for page in pages]
    raw_text = "\n\n".join(cleaned_pages)

    chunks: List[Dict[str, Any]] = []
    chunk_index = 0
    page_offset = 0

    for page_number, page_text in enumerate(cleaned_pages, start=1):
        page_chunks = split_text_into_chunks(
            page_text,
            page_number=page_number,
            base_offset=page_offset,
            min_chars=min_chunk_chars,
            max_chars=max_chunk_chars,
        )
        for chunk in page_chunks:
            chunk["chunk_index"] = chunk_index
            chunks.append(chunk)
            chunk_index += 1

        page_offset += len(page_text)
        if page_number < len(cleaned_pages):
            page_offset += 2

    return DocumentProcessingResult(
        title=filename,
        raw_text=raw_text,
        cleaned_text=raw_text,
        chunks=chunks,
        content_type=content_type,
    ).dict()
