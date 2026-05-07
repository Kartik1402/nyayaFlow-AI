import re
from datetime import datetime
from typing import Any, Dict, List, Tuple


def normalize_text_whitespace(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_text_into_paragraphs(text: str) -> List[Tuple[str, int, int]]:
    paragraphs: List[Tuple[str, int, int]] = []
    paragraph_pattern = re.compile(r"(.*?)(?:\n\s*\n|$)", flags=re.S)
    for match in paragraph_pattern.finditer(text):
        paragraph = match.group(1).strip()
        if not paragraph:
            continue
        start_offset = match.start(1) + match.group(1).find(paragraph)
        end_offset = start_offset + len(paragraph)
        paragraphs.append((paragraph, start_offset, end_offset))
    return paragraphs


def split_sentences_with_spans(text: str) -> List[Tuple[str, int, int]]:
    sentence_pattern = re.compile(r"(.*?(?:[\.\!?][\"')\]]*|$))(?=\s|$)", flags=re.S)
    sentences: List[Tuple[str, int, int]] = []
    for match in sentence_pattern.finditer(text):
        raw_sentence = match.group(1)
        sentence = raw_sentence.strip()
        if not sentence:
            continue
        start = match.start(1) + raw_sentence.find(sentence)
        end = start + len(sentence)
        sentences.append((sentence, start, end))
    return sentences


def get_word_spans(text: str) -> List[Tuple[int, int]]:
    return [(m.start(), m.end()) for m in re.finditer(r"\S+", text)]


def split_long_sentence(text: str, base_start: int, max_chars: int) -> List[Tuple[str, int, int]]:
    word_spans = get_word_spans(text)
    segments: List[Tuple[str, int, int]] = []
    start_index = 0
    while start_index < len(word_spans):
        end_index = start_index
        while end_index < len(word_spans) and (word_spans[end_index][1] - word_spans[start_index][0]) <= max_chars:
            end_index += 1
        if end_index == start_index:
            end_index += 1
        seg_start = base_start + word_spans[start_index][0]
        seg_end = base_start + word_spans[end_index - 1][1]
        segment_text = text[word_spans[start_index][0] : word_spans[end_index - 1][1]]
        segments.append((segment_text.strip(), seg_start, seg_end))
        start_index = end_index
    return segments


def split_text_into_chunks(
    text: str,
    page_number: int = 1,
    base_offset: int = 0,
    min_chars: int = 500,
    max_chars: int = 1000,
) -> List[Dict[str, Any]]:
    text = normalize_text_whitespace(text)
    paragraphs = split_text_into_paragraphs(text)
    chunks: List[Dict[str, Any]] = []
    chunk_index = 0

    for paragraph, para_start, _ in paragraphs:
        sentences = split_sentences_with_spans(paragraph)
        current_start = None
        current_end = None
        current_text_parts: List[str] = []

        def flush_chunk() -> None:
            nonlocal chunk_index, current_start, current_end, current_text_parts
            if current_start is None or not current_text_parts:
                return
            chunk_text = " ".join(current_text_parts).strip()
            chunks.append(
                {
                    "chunk_index": chunk_index,
                    "page_number": page_number,
                    "char_start": base_offset + current_start,
                    "char_end": base_offset + current_end,
                    "text": chunk_text,
                }
            )
            chunk_index += 1
            current_start = None
            current_end = None
            current_text_parts = []

        for sentence, sent_start, sent_end in sentences:
            sent_start += para_start
            sent_end += para_start
            if current_start is None:
                current_start = sent_start
                current_end = sent_end
                current_text_parts = [sentence]
                continue

            proposed_end = sent_end
            proposed_length = proposed_end - current_start
            if proposed_length > max_chars:
                current_length = current_end - current_start if current_start is not None else 0
                if current_length >= min_chars:
                    flush_chunk()
                    current_start = sent_start
                    current_end = sent_end
                    current_text_parts = [sentence]
                    continue
                if current_length == 0:
                    for segment_text, seg_start, seg_end in split_long_sentence(sentence, base_offset + sent_start, max_chars):
                        chunks.append(
                            {
                                "chunk_index": chunk_index,
                                "page_number": page_number,
                                "char_start": seg_start,
                                "char_end": seg_end,
                                "text": segment_text,
                            }
                        )
                        chunk_index += 1
                    current_start = None
                    current_end = None
                    current_text_parts = []
                    continue
                flush_chunk()
                current_start = sent_start
                current_end = sent_end
                current_text_parts = [sentence]
            else:
                current_end = sent_end
                current_text_parts.append(sentence)

        flush_chunk()

    return chunks


def normalize_title(title: str) -> str:
    title = title.strip()
    return re.sub(r"\s+", " ", title)


def timestamp_now() -> str:
    return datetime.utcnow().isoformat() + "Z"
