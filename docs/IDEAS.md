# IDEAS

## Naming

- Consider using `-` as an id separator: `read-file`. Compiler can flag ambiguities such as variables `read` and `file` existing in the current scope which could result in `read-file` being treated as a subtraction op.

## Compiler Errors

Options:

- Halt on error. One error per module/file.
- Skip errors. Seek next valid node. Use error nodes to store info.

## Debugging

- Should ignore type info when debugging - like a scripting language.