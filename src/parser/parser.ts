/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    CharacterStream,
    TokenType,
    TokenStream,
    Errors,
    Logger,
    SourceFile,
    lex,
    Dictionary,
    Type,
    Function,
    Struct,
    Variable,
    Parameter,
    Location,
    NodeType,
    KnownTypes,
} from "./mod.ts";

function parseID(ts: TokenStream) {
    return ts.nextMustBe(TokenType.TK_ID).lexeme;
}

function parseTypeParameters(ts: TokenStream) {
    const xs = new Array<Type>();
    while (!ts.nextIs("]")) {
        xs.push(parseType(ts));
        if (!ts.consumeIfNextIs(",")) break;
    }
    return xs;
}

function parseType(ts: TokenStream) {
    const idx = ts.getIndex();
    const loc = ts.loc();
    if (ts.consumeIfNextIs("[")) {
        const x = {
            id: "Array",
            typeParameters: parseTypeParameters(ts),
            loc: loc,
        };
        ts.nextMustBe("]");

        const tx = ts.getAsToken(idx, ts.getIndex());
        if (x.typeParameters.length != 1) {
            Errors.raiseArrayType(tx);
        }
        return x;
    }
    else {
        const id = ts.nextMustBe(TokenType.TK_TYPE).lexeme;
        if (ts.consumeIfNextIs("[")) {
            const x = {
                id: id,
                typeParameters: parseTypeParameters(ts),
                loc: loc,
            };
            ts.nextMustBe("]");
            return x;
        }
        else {
            return {
                id: id,
                loc: loc,
            };
        }
    }
}

const NumGrid: Dictionary<number> = {
    "0" : 0,
    "1" : 1,
    "2" : 2,
    "3" : 3,
    "4" : 4,
    "5" : 5,
    "6" : 6,
    "7" : 7,
    "8" : 8,
    "9" : 9,
    "A" : 10,
    "B" : 11,
    "C" : 12,
    "D" : 13,
    "E" : 14,
    "F" : 15,
    "a" : 10,
    "b" : 11,
    "c" : 12,
    "d" : 13,
    "e" : 14,
    "f" : 15,
}

function parseNumber(n: string, radix: number, loc: Location) {
    n = radix === 10 ? n : n.substring(2);
    const isKilo = n.endsWith("K");
    n = isKilo ? n.substring(0, n.length - 1) : n;

    let sum = BigInt(0);
    for (let i = 0; i < n.length; i += 1) {
        const d = n.charAt(n.length - i - 1);
        sum += BigInt(NumGrid[d] * (radix ** i));
    }
    sum = isKilo ? sum * BigInt(1024) : sum;
    return {
        nodeType: NodeType.NumberLiteral,
        value: sum,
        type: KnownTypes.Integer,
        loc: loc,
    };
}

function parseLiteral(ts: TokenStream) {
    const loc = ts.loc();
    const t = ts.next();
    switch (t.type) {
        case TokenType.TK_STRING_LITERAL: return {
            nodeType: NodeType.StringLiteral,
            value: t.lexeme.substring(1, t.lexeme.length - 1),
            type: KnownTypes.String,
            loc: loc,
        };
        case TokenType.TK_BOOLEAN_LITERAL: return {
            nodeType: NodeType.BooleanLiteral,
            value: t.lexeme === "true",
            type: KnownTypes.Bool,
            loc: loc,
        };
        case TokenType.TK_BINARY_NUMBER_LITERAL: return parseNumber(t.lexeme, 2, loc);
        case TokenType.TK_OCTAL_NUMBER_LITERAL: return parseNumber(t.lexeme, 8, loc);
        case TokenType.TK_HEXADECIMAL_NUMBER_LITERAL: return parseNumber(t.lexeme, 16, loc);
        case TokenType.TK_DECIMAL_NUMBER_LITERAL: return parseNumber(t.lexeme, 10, loc);
        default: return Errors.raiseDebug();
    }
}

function parseFunctionApplication(ts: TokenStream, id: string, loc: Location) {
    const xs = new Array<any>();
    ts.nextMustBe("(");
    while (!ts.nextIs(")")) {
        xs.push(parseExpr(ts));
        if (!ts.consumeIfNextIs(",")) break;
    }
    ts.nextMustBe(")");
    return {
        nodeType: NodeType.FunctionApplication,
        id: id,
        args: xs,
        loc: loc,
    };
}

function parseExpr(ts: TokenStream) {
    if (ts.nextIsLiteral()) return parseLiteral(ts);
    const loc = ts.loc();
    const id = parseID(ts);
    if (ts.nextIs("(")) {
        return parseFunctionApplication(ts, id, loc);
    }
    else {
        return {
            nodeType: NodeType.IDExpr,
            id: id,
            loc: loc,
        }
    }
}

function parseVarDef(ts: TokenStream, isMutable: boolean, typeCanBeInferred: boolean) {
    const loc = ts.loc();
    const id = parseID(ts);
    const type = typeCanBeInferred ? KnownTypes.NotInferred : parseVarType(ts, true);
    return {
        id: id,
        type: type,
        isMutable: isMutable,
        loc: loc,
    }
}

function parseVarInit(ts: TokenStream, isMutable: boolean) {
    const loc = ts.loc();
    const v = parseVarDef(ts, isMutable, true);
    ts.nextMustBe("=");
    const expr = parseExpr(ts);
    return {
        nodeType: NodeType.VarInitStmt,
        var: v,
        expr: expr,
        loc: loc,
    }
}

function parseBody(ts: TokenStream) {
    const xs = new Array<any>();
    while (!ts.nextIs("}")) {
        if (ts.consumeIfNextIs("let")) {
            xs.push(parseVarInit(ts, false));
        }
        else if (ts.consumeIfNextIs("mut")) {
            xs.push(parseVarInit(ts, true));
        }
        else {
            const loc = ts.loc();
            const id = parseID(ts);
            if (ts.consumeIfNextIs("=")) {
                xs.push({
                    nodeType: NodeType.VarAssnStmt,
                    id: id,
                    expr: parseExpr(ts),
                    loc: loc,
                });
            }
            else {
                xs.push({
                    nodeType: NodeType.FunctionApplicationStmt,
                    fa: parseFunctionApplication(ts, id, loc),
                    loc: loc,
                });
            }
        }
        ts.nextMustBe(";");
    }
    return xs;
}

function parseVariableList(ts: TokenStream, isMutable: boolean, typeCanBeInferred: boolean) {
    const xs = new Array<Parameter>();
    while (ts.peek().lexeme !== ")") {
        xs.push(parseVarDef(ts, isMutable, typeCanBeInferred));
        if (ts.peek().lexeme === ")") continue;
        ts.nextMustBe(",");
    }
    return xs;
}

function parseParameterList(ts: TokenStream) {
    return parseVariableList(ts, false, false);
}

function parseStructMemberList(ts: TokenStream) {
    return parseVariableList(ts, false, false);
}

function parseVarType(ts: TokenStream, force: boolean) {
    if (force) {
        ts.nextMustBe(":");
        return parseType(ts);
    }
    else {
        if (ts.consumeIfNextIs(":")) {
            return parseType(ts);
        }
        else {
            return KnownTypes.Void;
        }
    }
}

function parseFunction(ts: TokenStream) {
    const loc = ts.loc();
    ts.nextMustBe("fn");
    const id = parseID(ts);
    ts.nextMustBe("(");
    const xs = parseParameterList(ts);
    ts.nextMustBe(")");
    const returnType = parseVarType(ts, false);
    ts.nextMustBe("{");
    const body = parseBody(ts);
    ts.nextMustBe("}");

    return {
        id: id,
        params: xs,
        returnType: returnType,
        body: body,
        loc: loc,
    };
}

function parseStruct(ts: TokenStream) {
    const loc = ts.loc();
    ts.nextMustBe("struct");
    const ty = parseType(ts);
    ts.nextMustBe("(");
    const members = parseStructMemberList(ts);
    ts.nextMustBe(")");
    return {
        type: ty,
        members: members,
        loc: loc,
    }
}

function parseModule(ts: TokenStream, path: string) {
    const xs = new Array<Function>();
    const ys = new Array<Struct>();
    while (!ts.eof()) {
        if (ts.nextIs("fn")) {
            xs.push(parseFunction(ts));
        }
        else if (ts.nextIs("struct")) {
            ys.push(parseStruct(ts));
        }
        else {
            Errors.raiseDebug();
        }
    }

    return {
        path: path,
        functions: xs,
        structs: ys,
    };
}

export default function parse(f: SourceFile) {
    Logger.info(`Parsing: ${f.path}`);
    const cs = CharacterStream.build(f.contents, f.fsPath);
    const ts = lex(cs);
    return parseModule(ts, f.path);
}