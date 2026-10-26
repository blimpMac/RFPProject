from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise RuntimeError(f'Expected generated block missing in {path}: {old[:100]!r}')
    target.write_text(text.replace(old, new, 1))


replace_once(
    'server/services/finance-stage-workflow.ts',
    "  let nextStatus = currentStatus;\n  let actionLabel = '';",
    "  let nextStatus: string;\n  let actionLabel: string;",
)

replace_once(
    'src/pages/ApprovalsPage.tsx',
    "const requiresOriginals = (_request: RfpRequest) => true;\n",
    "const requiresOriginals = (request: RfpRequest) => {\n  void request;\n  return true;\n};\n",
)

replace_once(
    'src/pages/ApprovalsPage.tsx',
    "const awaitingOriginals = (request: RfpRequest) =>\n  request.final_status === 'Awaiting Hard Copy Verification' &&\n  (financeOperations(request).document_verification !== 'Complete' ||\n    !financeOperations(request).originals_received_date);\n\n",
    "",
)

print('Cleaned generated remap lint issues.')
