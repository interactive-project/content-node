import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource
root = Path(__file__).resolve().parent.parent
def read(path):
    return json.loads((root / path).read_text())
schema = read("schemas/content-node.v1.schema.json")
shared = read("node_modules/@interactive-project/protocol/schemas/shared-content.v1.schema.json")
Draft202012Validator.check_schema(schema)
registry = Registry().with_resource(shared["$id"], Resource.from_contents(shared))
validator = Draft202012Validator(schema, registry=registry, format_checker=FormatChecker())
manifest = read("fixtures/conformance.json")
for entry in manifest:
    expected = entry["valid"] or entry.get("structural") is False
    assert validator.is_valid(read("fixtures/" + entry["file"])) == expected, entry["file"]
print(f"Python: {len(manifest)} independent structural content fixtures passed.")
