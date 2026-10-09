"""Erro comum dos provedores de modelo. status_code 429 = limite de uso do provedor."""


class ProviderError(Exception):
    def __init__(self, status_code: int, detail: str = ""):
        super().__init__(f"{status_code}: {detail}")
        self.status_code = status_code
