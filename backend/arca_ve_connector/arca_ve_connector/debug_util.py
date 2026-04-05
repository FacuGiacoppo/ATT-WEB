"""Flags y logging de depuración para homologación ARCA."""

from __future__ import annotations

import logging
import os
import sys

_LOGGER = logging.getLogger("arca_ve_connector")


def is_arca_debug() -> bool:
    v = (os.environ.get("ARCA_DEBUG") or "").strip().lower()
    return v in ("1", "true", "yes", "on")


def configure_logging_debug() -> None:
    if not is_arca_debug():
        return
    root = logging.getLogger("arca_ve_connector")
    if root.handlers:
        return
    h = logging.StreamHandler(sys.stderr)
    h.setFormatter(logging.Formatter("%(levelname)s [arca] %(message)s"))
    root.addHandler(h)
    root.setLevel(logging.DEBUG)


def dlog(msg: str, *args: object) -> None:
    if is_arca_debug():
        configure_logging_debug()
        _LOGGER.debug(msg, *args)


def dprint(msg: str) -> None:
    """Salida explícita a stderr para corridas manuales."""
    if is_arca_debug():
        print(msg, file=sys.stderr)
