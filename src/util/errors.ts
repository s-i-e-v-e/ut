/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    P,
    A,
} from "../parser/mod.ts";
import {
    CharacterStream,
    Token,
} from "../parser/mod.internal.ts";
const toTypeString = P.Types.toTypeString;
type Type = P.Type;
type Variable = P.Variable;
type NodeType = A.NodeType;
type Location = P.Location;
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

    static DuplicateDef = class extends Errors.SemanticError {
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

    static Lexer = class {
        static raiseInvalidNumber(cs: CharacterStream, loc: Location): never {
            const lexeme = cs.lexeme(loc, cs.loc());
            throw new Errors.InvalidNumber(buildErrorString(`Invalid number: ${lexeme}`, loc));
        }

        static raiseInvalidDecimalNumber(cs: CharacterStream, loc: Location): never {
            const lexeme = cs.lexeme(loc, cs.loc());
            throw new Errors.InvalidNumber(buildErrorString(`Decimal numbers cannot have leading zeros: ${lexeme}`, loc));
        }

        static raiseUnbalancedComment(cs: CharacterStream, loc: Location): never {
            const lexeme = cs.lexeme(loc, cs.loc());
            throw new Errors.UnbalancedComment(buildErrorString(`Unbalanced comment: ${lexeme}`, loc));
        }

        static raiseUnterminatedString(cs: CharacterStream, loc: Location): never {
            const lexeme = cs.lexeme(loc, cs.loc());
            throw new Errors.UnterminatedString(buildErrorString(`Unterminated string: ${lexeme}`, loc));
        }
    };

    static Parser = class {
        static parserError(msg: string, t: Token): never {
            throw new Errors.ParserError(buildErrorString(`${msg}: ${t.lexeme}`, t.loc));
        }

        static raiseExpectedButFound(exp: string, t_n: Token|A.AstNode): never {
            const x = t_n as Token;
            const y = t_n as A.AstNode;
            throw new Errors.ExpectedButFound(buildErrorString(`Expected: ${exp}. Found: \`${x.lexeme ? x.lexeme : NodeTypeEnum[y.nodeType]}\``, t_n.loc));
        }

        static raiseArrayType(loc: Location): never {
            throw new Errors.ArrayType(buildErrorString(`Array must have exactly one type parameter.`, loc));
        }
    };


    static Checker = class {
        static raiseDuplicateDef(id: string, loc: Location): never {
            throw new Errors.ArrayInit(buildErrorString(`\`${id}\` already exists in current scope.`, loc));
        }
        static raiseArrayInitArgs(loc: Location): never {
            throw new Errors.ArrayInit(buildErrorString(`Array initialization failure: argument list is empty`, loc));
        }

        static raiseUnknownType(t: Type|string, loc: Location): never {
            const s = (t as Type).id ? toTypeString(t as Type) : t;
            throw new Errors.UnknownType(buildErrorString(`Unknown type: ${s}`, loc));
        }

        static raiseTypeMismatch(ltype: Type, rtype: Type, loc: Location): never {
            throw new Errors.TypeMismatch(buildErrorString(`Type mismatch: ${toTypeString(ltype)} != ${toTypeString(rtype)}`, loc));
        }

        static raiseMathTypeError(t: Type, loc: Location): never {
            throw new Errors.TypeMismatch(buildErrorString(`Math ops only defined on Integer, not ${toTypeString(t)}.`, loc));
        }

        static raiseArrayIndexError(t: Type, loc: Location): never {
            throw new Errors.TypeMismatch(buildErrorString(`Array index(es) must be Integer(s), not ${toTypeString(t)}.`, loc));
        }

        static raiseLogicalOperationError(t: Type, loc: Location): never {
            throw new Errors.TypeMismatch(buildErrorString(`Logic ops only defined on Bool, not ${toTypeString(t)}.`, loc));
        }

        static raiseNegationOperationError(t: Type, loc: Location): never {
            throw new Errors.TypeMismatch(buildErrorString(`Negation op only defined on Bits/Bool, not ${toTypeString(t)}.`, loc));
        }

        static raiseIfConditionError(t: Type, loc: Location): never {
            throw new Errors.TypeMismatch(buildErrorString(`IF condition must evaluate to a Bool, not ${toTypeString(t)}.`, loc));
        }

        static raiseForConditionError(t: Type, loc: Location): never {
            throw new Errors.TypeMismatch(buildErrorString(`FOR condition must evaluate to a Bool, not ${toTypeString(t)}.`, loc));
        }

        static raiseTypeError(msg: string, loc: Location): never {
            throw new Errors.TypeMismatch(buildErrorString(msg, loc));
        }

        static raiseUnknownIdentifier(id: string, loc: Location): never {
            throw new Errors.UnknownIdentifier(buildErrorString(`Unknown identifier: ${id}`, loc));
        }

        static raiseUnknownFunction(id: string, loc: Location): never {
            throw new Errors.UnknownIdentifier(buildErrorString(`Unknown function: ${id}`, loc));
        }

        static raiseImmutableVar(v: Variable, loc: Location): never {
            throw new Errors.ImmutableVar(buildErrorString(`Cannot assign to immutable variable: ${v.id}`, loc));
        }

        static raiseFunctionParameterCountMismatch(id: string, loc: Location): never {
            throw new Errors.FunctionParameterCountMismatch(buildErrorString(`Function parameter and arg counts differ: ${id}`, loc));
        }

        static raiseIfExprMustReturn(loc: Location): never {
            throw new Errors.IfExprMustReturn(buildErrorString(`IF/ELSE expression must return a value.`, loc));
        }

        static unreachableCode(loc: Location): never {
            throw new Errors.TypeMismatch(buildErrorString(`Unreachable code after return.`, loc));
        }

        static error(msg: string, loc: Location): never {
            throw new Errors.UnknownType(buildErrorString(msg, loc));
        }
    };

    static raiseEOF(): never {
        throw new this.EOF("EOF");
    }

    static ASSERT(condition: boolean, msg?: string, loc?: Location): asserts condition {
        const m = msg ? (loc ? buildErrorString(msg || "", loc!) : msg) : "";
        if (!condition) throw new this.Debug(m);
    }

    static raiseDebug(msgOrNode?: string|NodeType, loc?: Location): never {
        const s = msgOrNode ? (typeof msgOrNode === "string" ? msgOrNode as string : NodeTypeEnum[msgOrNode as NodeType]) : "DebugError";
        const ss = loc ? buildErrorString(s || "", loc!) : s;
        throw new this.Debug(ss);
    }

    static notImplemented(msg?: string): never {
        throw new Error(msg || "notImplemented");
    }

    static raiseVmError(msg: string) {
        throw new this.VmError(msg);
    }

    static breakIf(cond: boolean) {
        Errors.debug(!cond);
    }

    static debug(cond?: boolean) {
        if (cond === undefined || !cond) {
            try {
                throw new Error();
            }
            catch (e) {
                // swallow
            }
        }
    }
}