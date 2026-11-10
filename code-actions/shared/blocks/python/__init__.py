"""Platform runtime for Python code actions — bundled into the zip as the `blocks` package."""

from .blocks_client import BlocksApiError, BlocksClient

__all__ = ["BlocksApiError", "BlocksClient"]
