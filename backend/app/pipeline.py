from typing import Any, Dict, List, Optional

from app.agents import (
    run_action_plan_agent,
    run_explanation_agent,
    run_extraction_agent,
    run_reasoning_agent,
)
from app.utils import split_text_into_chunks, timestamp_now


def build_case_state(raw_text: str, title: str, previous_state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    state = previous_state.copy() if previous_state else {}
    state["raw_text"] = raw_text
    state["chunks"] = split_text_into_chunks(raw_text)
    state["title"] = title
    return state


def enrich_extraction(state: Dict[str, Any], repair_context: str | None = None) -> Dict[str, Any]:
    extracted = run_extraction_agent(state.get("chunks", []))
    return {
        **state,
        "extraction": extracted,
        "run_history": append_history(state.get("run_history"), "extraction", repair_context),
    }


def enrich_reasoning(state: Dict[str, Any], repair_context: str | None = None) -> Dict[str, Any]:
    reasoning = run_reasoning_agent(state.get("extraction", {}))
    return {
        **state,
        "reasoning": reasoning,
        "run_history": append_history(state.get("run_history"), "reasoning", repair_context),
    }


def enrich_decision(state: Dict[str, Any], repair_context: str | None = None) -> Dict[str, Any]:
    return {
        **state,
        "decision": state.get("reasoning"),
        "run_history": append_history(state.get("run_history"), "decision", repair_context),
    }


def enrich_action_plan(state: Dict[str, Any], repair_context: str | None = None) -> Dict[str, Any]:
    action_plan = run_action_plan_agent(state.get("extraction", {}), state.get("reasoning", {}))
    return {
        **state,
        "action_plan": action_plan,
        "run_history": append_history(state.get("run_history"), "action_plan", repair_context),
    }


def enrich_explanation(state: Dict[str, Any], repair_context: str | None = None) -> Dict[str, Any]:
    explanation = run_explanation_agent(state.get("extraction", {}), state.get("reasoning", {}))
    return {
        **state,
        "explanation": explanation,
        "run_history": append_history(state.get("run_history"), "explanation", repair_context),
    }


def build_full_pipeline(raw_text: str, title: str, previous_state: Optional[Dict[str, Any]] = None, repair_context: str | None = None) -> Dict[str, Any]:
    state = build_case_state(raw_text, title, previous_state)
    state = enrich_extraction(state, repair_context)
    state = enrich_reasoning(state, repair_context)
    state = enrich_decision(state, repair_context)
    state = enrich_action_plan(state, repair_context)
    state = enrich_explanation(state, repair_context)
    return state


def reprocess_state(state: Dict[str, Any], rejection_type: str, repair_context: str | None = None) -> Dict[str, Any]:
    if rejection_type == "extraction":
        state = enrich_extraction(state, repair_context)
        state = enrich_reasoning(state, repair_context)
        state = enrich_action_plan(state, repair_context)
        state = enrich_explanation(state, repair_context)
    elif rejection_type == "reasoning":
        state = enrich_reasoning(state, repair_context)
        state = enrich_action_plan(state, repair_context)
        state = enrich_explanation(state, repair_context)
    elif rejection_type == "action_plan":
        state = enrich_action_plan(state, repair_context)
        state = enrich_explanation(state, repair_context)
    return state


def append_history(history: Optional[List[Dict[str, Any]]], stage: str, repair_context: str | None = None) -> List[Dict[str, Any]]:
    history = history or []
    history.append({
        "stage": stage,
        "timestamp": timestamp_now(),
        "repair_context": repair_context,
    })
    return history
