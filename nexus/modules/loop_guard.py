"""
NEXUS Loop Guard — arrête un agent IA qui tourne en rond (idée reprise d'OpenClaw).
- 3 erreurs IDENTIQUES d'affilée (même outil, mêmes arguments, même erreur) → stop ;
- le même appel (outil + arguments) répété 4 fois, même sans erreur → stop (aucun progrès).
Un résultat différent ou un succès remet le compteur d'erreurs à zéro.
"""
import json


def _key(name: str, args: dict) -> str:
    try:
        return name + ':' + json.dumps(args, sort_keys=True, ensure_ascii=False, default=str)
    except Exception:
        return name + ':' + str(args)


def looks_like_error(result: str) -> bool:
    r = (result or '').lstrip()[:80].lower()
    return r.startswith(('❌', 'erreur', 'error', 'traceback')) or 'exception' in r


class LoopGuard:
    def __init__(self, max_same_errors: int = 3, max_same_calls: int = 4) -> None:
        self.max_same_errors = max_same_errors
        self.max_same_calls = max_same_calls
        self._calls: dict[str, int] = {}
        self._last_error: tuple[str, str] | None = None
        self._error_streak = 0

    def check(self, name: str, args: dict, result: str, is_error: bool | None = None) -> str | None:
        """À appeler après chaque outil. Renvoie un message d'arrêt, ou None pour continuer."""
        k = _key(name, args)
        self._calls[k] = self._calls.get(k, 0) + 1
        err = looks_like_error(result) if is_error is None else is_error
        if err:
            sig = (k, (result or '')[:200])
            self._error_streak = self._error_streak + 1 if sig == self._last_error else 1
            self._last_error = sig
        else:
            self._error_streak = 0
            self._last_error = None
        if self._error_streak >= self.max_same_errors:
            return (f"J'arrête : l'outil {name} a échoué {self._error_streak} fois de suite avec la même erreur "
                    f"({(result or '')[:150]}). Il faut changer d'approche.")
        if self._calls[k] >= self.max_same_calls:
            return f"J'arrête : je refais la même action ({name}) sans avancer. Dis-moi comment continuer."
        return None
