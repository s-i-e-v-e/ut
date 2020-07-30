/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Location,
    P,
    A,
} from "../parser/mod.ts";
import {
    CharacterStream,
    Token,
} from "../parser/mod.internal.ts";
const toTypeString = P.toTypeString;
type Type = P.Type;
type Variable = P.Variable;
type NodeType = A.NodeType;
const NodeTypeEnum = A.NodeType;

export function buildLocation(loc: Location) {
    const path = loc.path.replaceAll(/\\/g, "/");
    return `at file:///${path}:${loc.line}:${loc.character}`;
}

function buildErrorString(msg: string, loc: Location) {
    const x = buildLocation(loc);
    return `${msg}\t${x}`;
}

export default class Errors {
    static buildLocation(loc: Location) {
        return buildLocation(loc);
    }

    static Debug = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UtError = class extends Error {
        constructor(msg: string) {
            super(msg);
        }
    }

    static EOF = class extends Errors.UtError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static LexerError = class extends Errors.UtError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static InvalidNumber = class extends Errors.LexerError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UnbalancedComment = class extends Errors.LexerError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UnterminatedString = class extends Errors.LexerError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static ParserError = class extends Errors.UtError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static ExpectedButFound = class extends Errors.ParserError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static ArrayType = class extends Errors.ParserError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static ArrayInit = class extends Errors.ParserError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static IfExprMustReturn = class extends Errors.ParserError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static SemanticError = class extends Errors.UtError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UnknownType = class extends Errors.SemanticError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static TypeMismatch = class extends Errors.SemanticError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static UnknownIdentifier = class extends Errors.SemanticError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static ImmutableVar = class extends Errors.SemanticError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static FunctionParameterCountMismatch = class extends Errors.SemanticError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static VmError = class extends Errors.UtError {
        constructor(msg: string) {
            super(msg);
        }
    }

    static raiseInvalidNumber(cs: CharacterStream, loc: Location): never {
        const lexeme = cs.lexeme(loc, cs.loc());
        throw new this.InvalidNumber(buildErrorString(`Invalid number: ${lexeme}`, loc));
    }

    static raiseInvalidDecimalNumber(cs: CharacterStream, loc: Location): never {
        const lexeme = cs.lexeme(loc, cs.loc());
        throw new this.InvalidNumber(buildErrorString(`Decimal numbers cannot have leading zeros: ${lexeme}`, loc));
    }

    static raiseUnbalancedComment(cs: CharacterStream, loc: Location): never {
        const lexeme = cs.lexeme(loc, cs.loc());
        throw new this.UnbalancedComment(buildErrorString(`Unbalanced comment: ${lexeme}`, loc));
    }

    static raiseUnterminatedString(cs: CharacterStream, loc: Location): never {
        const lexeme = cs.lexeme(loc, cs.loc());
        throw new this.UnterminatedString(buildErrorString(`Unterminated string: ${lexeme}`, loc));
    }

    static raiseEOF(): never {
        throw new this.EOF("EOF");
    }

    static raiseParserError(exp: string, n: A.AstNode): never {
        throw new this.ParserError(buildErrorString(`Expected ${exp}. Found: \`${NodeTypeEnum[n.nodeType]}\``, n.loc));
    }

    static raiseDebug(msgOrNode?: string|NodeType): never {
        const s = msgOrNode ? (typeof msgOrNode === "string" ? msgOrNode as string : NodeTypeEnum[msgOrNode as NodeType]) : "DebugError";
        throw new this.Debug(s);
    }

    static raiseExpectedButFound(exp: string, t: Token): never {
        throw new this.ExpectedButFound(buildErrorString(`Expected: ${exp}. Found: \`${t.lexeme}\``, t.loc));
    }

    static raiseArrayType(t: Token): never {
        throw new this.ArrayType(buildErrorString(`Array must have exactly one type parameter: \`${t.lexeme}\``, t.loc));
    }

    static raiseArrayInitArgs(t: Token) {
        throw new this.ArrayInit(buildErrorString(`Array initialization failure: argument list is empty`, t.loc));
    }

    static raiseUnknownType(t: Type, loc: Location): never {
        throw new this.UnknownType(buildErrorString(`Unknown type: ${toTypeString(t)}`, loc));
    }

    static raiseTypeMismatch(ltype: Type, rtype: Type, loc: Location): never {
        throw new this.TypeMismatch(buildErrorString(`Type mismatch: ${toTypeString(ltype)} != ${toTypeString(rtype)}`, loc));
    }

    static raiseMathTypeError(t: Type, loc: Location): never {
        throw new this.TypeMismatch(buildErrorString(`Math ops only defined on Integer, not ${toTypeString(t)}.`, loc));
    }

    static raiseArrayIndexError(t: Type, loc: Location): never {
        throw new this.TypeMismatch(buildErrorString(`Array index(es) must be Integer(s), not ${toTypeString(t)}.`, loc));
    }

    static raiseLogicalOperationError(t: Type, loc: Location): never {
        throw new this.TypeMismatch(buildErrorString(`Logic ops only defined on Bool, not ${toTypeString(t)}.`, loc));
    }

    static raiseIfConditionError(t: Type, loc: Location): never {
        throw new this.TypeMismatch(buildErrorString(`IF condition must evaluate to a Bool, not ${toTypeString(t)}.`, loc));
    }

    static raiseForConditionError(t: Type, loc: Location): never {
        throw new this.TypeMismatch(buildErrorString(`FOR condition must evaluate to a Bool, not ${toTypeString(t)}.`, loc));
    }

    static raiseTypeError(msg: string, loc: Location): never {
        throw new this.TypeMismatch(buildErrorString(msg, loc));
    }

    static raiseUnknownIdentifier(id: string, loc: Location): never {
        throw new this.UnknownIdentifier(buildErrorString(`Unknown identifier: ${id}`, loc));
    }

    static raiseImmutableVar(v: Variable, loc: Location) {
        throw new this.ImmutableVar(buildErrorString(`Cannot assign to immutable variable: ${v.id}`, loc));
    }

    static raiseFunctionParameterCountMismatch(id: string, loc: Location) {
        throw new this.FunctionParameterCountMismatch(buildErrorString(`Function parameter and arg counts differ: ${id}`, loc));
    }

    static raiseIfExprMustReturn(loc: Location) {
        throw new this.IfExprMustReturn(buildErrorString(`IF/ELSE expression must return a value.`, loc));
    }

    static raiseUnreachableCode(loc: Location) {
        throw new this.TypeMismatch(buildErrorString(`Unreachable code after return.`, loc));
    }

    static raiseVmError(msg: string) {
        throw new this.VmError(msg);
    }

    static debug(cond?: boolean) {
        if (cond === undefined || cond) {
            try {
                throw new Error();
            }
            catch (e) {
                // swallow
            }
        }
    }
}