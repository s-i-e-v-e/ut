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
    lex,
} from "./mod.internal.ts";
import {
    Location,
    P,
    A,
} from "./mod.ts";
import {
    Errors,
    Logger,
    Dictionary,
    SourceFile,
} from "../util/mod.ts";

const NodeType = A.NodeType;
const KnownTypes = P.KnownTypes;
type Expr = A.Expr;
type Stmt = A.Stmt;
type Type = P.Type;

function parseID(ts: TokenStream) {
    return ts.nextMustBe(TokenType.TK_ID).lexeme;
}

function parseIDExpr(ts: TokenStream): A.IDExpr {
    const loc = ts.loc();
    const id = parseID(ts);

    return {
        nodeType: NodeType.IDExpr,
        id: id,
        loc: loc,
        type: KnownTypes.NotInferred,
    }
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

function parseExprList(ts: TokenStream, level: number) {
    const xs = new Array<any>();
    while (!ts.nextIs(")")) {
        xs.push(parseRExpr(ts, level));
        if (!ts.consumeIfNextIs(",")) break;
    }
    return xs;
}

function parseTypeConstructor(ts: TokenStream, level: number): A.ArrayConstructor {
    const loc = ts.loc();
    const ty = parseType(ts);
    if (ty.id === "Array") {
        // is array constructor
        const t = ts.peek();
        ts.nextMustBe("(");
        let sizeExpr = undefined;
        let args = undefined;
        if (ts.consumeIfNextIs("#")) {
            sizeExpr = parseRExpr(ts, level);
        }
        else {
            args = parseExprList(ts, level);
            if (!args.length) Errors.raiseArrayInitArgs(t);
        }
        ts.nextMustBe(")");
        return <A.ArrayConstructor>{
            nodeType: NodeType.ArrayConstructor,
            loc: loc,
            type: ty,
            sizeExpr: sizeExpr,
            args: args,
        };
    }
    else {
        Errors.raiseDebug();
    }
}

function parseIfExpr(ts: TokenStream, level: number, isStmt: boolean): A.IfExpr {
    const mustReturn = (be: A.BlockExpr, loc: Location) => {
        // last statement must be a return
        const last = be.xs.length ? be.xs[be.xs.length - 1] : undefined;
        if (last && last.nodeType === NodeType.ExprStmt && (last as A.ExprStmt).expr.nodeType === NodeType.ReturnExpr) {
            // ignore
        }
        else {
            Errors.raiseIfExprMustReturn(loc);
        }
    };

    const loc = ts.loc();
    ts.nextMustBe("if");
    ts.nextMustBe("(");
    const cond = parseRExpr(ts, level);
    ts.nextMustBe(")");
    ts.nextMustBe("{");
    const l1 = ts.loc();
    const ifBranch = parseBlockExpr(ts, level);
    ts.nextMustBe("}");
    ts.nextMustBe("else");
    ts.nextMustBe("{");
    const l2 = ts.loc();
    const elseBranch = parseBlockExpr(ts, level);
    ts.nextMustBe("}");

    if (!isStmt) mustReturn(ifBranch, l1);
    if (!isStmt) mustReturn(elseBranch, l2);
    return {
        nodeType: NodeType.IfExpr,
        condition: cond,
        ifBranch: ifBranch,
        elseBranch: elseBranch,
        loc: loc,
        type: KnownTypes.NotInferred,
    };
}

function parseFunctionApplication(ts: TokenStream, level: number, ide: A.IDExpr): A.FunctionApplication {
    ts.nextMustBe("(");
    const xs = parseExprList(ts, level);
    ts.nextMustBe(")");
    return {
        nodeType: NodeType.FunctionApplication,
        id: ide.id,
        args: xs,
        loc: ide.loc,
        type: KnownTypes.NotInferred,
    };
}

function parseCastExpr(ts: TokenStream, e: Expr): A.CastExpr {
    ts.nextMustBe("as");
    return {
        nodeType: NodeType.CastExpr,
        expr: e,
        loc: e.loc,
        type: parseType(ts),
    };
}

function parseReferenceExpr(ts: TokenStream, level: number): A.ReferenceExpr {
    const loc = ts.loc();
    ts.nextMustBe("&");
    return {
        nodeType: NodeType.ReferenceExpr,
        expr: parseLExpr(ts, level),
        loc: loc,
        type: KnownTypes.NotInferred,
    };
}

function parseDereferenceExpr(ts: TokenStream): A.DereferenceExpr {
    const loc = ts.loc();
    ts.nextMustBe("*");
    const e = ts.nextIs("*") ? parseDereferenceExpr(ts) :  parseIDExpr(ts);
    return {
        nodeType: NodeType.DereferenceExpr,
        expr: e,
        loc: loc,
        type: KnownTypes.NotInferred,
    };
}

function parseLExpr(ts: TokenStream, level: number): Expr {
    let e;
    if (ts.nextIs("*")) {
        e = parseDereferenceExpr(ts);
    }
    else {
        const ide = parseIDExpr(ts);
        if (ts.nextIs("(")) {
            e = parseFunctionApplication(ts, level, ide);
        }
        else {
            e = ide;
        }
    }
    return e;
}

function _parseRExpr(ts: TokenStream, level: number, e1?: Expr, op?: string): Expr {
    let e;
    if (ts.nextIsLiteral()) {
        e = parseLiteral(ts);
    }
    else if (ts.nextIsType()) {
        e = parseTypeConstructor(ts, level);
    }
    else if (ts.nextIs("if")) {
        e = parseIfExpr(ts, level, false);
    }
    else if (ts.nextIs("&")) {
        e = parseReferenceExpr(ts, level);
    }
    else {
        e = parseLExpr(ts, level);
    }

    if (e1) {
        e = A.buildBinaryExpr(e1, op!, e);
    }
    else {
        // ignore
    }

    if (ts.nextIs("as")) {
        e = parseCastExpr(ts, e);
    }
    return e;
}

function parseRExpr(ts: TokenStream, level: number, precedence?: number, e1?: Expr, op?: string): Expr {
    precedence = precedence || 0;
    const e = e1 && !op ? e1 : _parseRExpr(ts, level, e1, op);

    interface Precedence {
        precedence: number;
        op: string;
    }

    const set = (opx: Precedence, precedence: number, isAssignment?: boolean) => {
        let op = ts.next().lexeme;
        if (ts.consumeIfNextIs("=")) {
            opx.op = op+"=";
            opx.precedence = isAssignment ? 10 : precedence;
        }
        else {
            opx.op = op;
            opx.precedence = precedence;
        }
    };

    const opx = {
        precedence: 0,
        op: "",
    };

    if (ts.nextIs("*") || ts.nextIs("/") || ts.nextIs("%")) {
        set(opx, 100, true);
    }
    else if (ts.nextIs("+") || ts.nextIs("-")) {
        set(opx, 90, true);
    }
    else if (ts.nextIs(">") || ts.nextIs("<")) {
        set(opx, 80);
    }
    else if (ts.nextIs("=") || ts.nextIs("!")) {
        set(opx, 70);
    }
    else if (ts.nextIs("&") || ts.nextIs("|")) {
        set(opx, 60, true);
    }
    else {
        return e;
    }

    if (precedence <= opx.precedence) {
        return parseRExpr(ts, level, opx.precedence, e, opx.op);
    }
    else {
        return A.buildBinaryExpr(e, opx.op, parseRExpr(ts, precedence));
    }
}

function parseVarInit(ts: TokenStream, level: number, isMutable: boolean): A.VarInitStmt  {
    const loc = ts.loc();
    ts.nextMustBe(isMutable ? "var" : "let");
    const v = parseVarDef(ts, isMutable, false);
    ts.nextMustBe("=");
    const expr = parseRExpr(ts, level);
    return {
        nodeType: NodeType.VarInitStmt,
        var: v,
        expr: expr,
        loc: loc,
    }
}

function parseVarAssignment(ts: TokenStream, level: number, le: Expr): A.VarAssnStmt {
    if (ts.consumeIfNextIs("=")) {
        return A.buildVarAssnStmt(le, parseRExpr(ts, level));
    }
    else {
        const e = parseRExpr(ts, level, 0, le) as A.BinaryExpr;
        if (!e.op) Errors.raiseDebug();

        // rewrite
        switch (e.op) {
            case "+=": e.op = "+"; break;
            case "-=": e.op = "-"; break;
            case "*=": e.op = "*"; break;
            case "/=": e.op = "/"; break;
            case "%=": e.op = "%"; break;
            case "&=": e.op = "&"; break;
            case "|=": e.op = "|"; break;
            default: Errors.raiseDebug();
        }

        return A.buildVarAssnStmt(le, e);
    }
}

function parseForStmt(ts: TokenStream, level: number): A.ForStmt {
    const loc = ts.loc();
    ts.nextMustBe("for");
    ts.nextMustBe("(");
    const init = ts.consumeIfNextIs(";") ? undefined : parseVarInit(ts, level, true);
    if (init) ts.nextMustBe(";");
    const condition = ts.consumeIfNextIs(";") ? undefined : parseRExpr(ts, level);
    if (condition) ts.nextMustBe(";");
    const update = ts.nextIs(")") ? undefined : parseVarAssignment(ts, level, parseIDExpr(ts));
    ts.nextMustBe(")");
    ts.nextMustBe("{");
    const body = parseBlockExpr(ts, level);
    ts.nextMustBe("}");

    return {
        nodeType: NodeType.ForStmt,
        init: init,
        condition: condition,
        update: update,
        body: body,
        loc: loc,
    };
}

function parseReturnExpr(ts: TokenStream, level: number, loc: Location): A.ReturnExpr {
    return {
        nodeType: NodeType.ReturnExpr,
        expr: parseRExpr(ts, level),
        type: KnownTypes.NotInferred,
        loc: loc,
    };
}

function parseAssnOrExprStmt(ts: TokenStream, level: number) {
    const loc = ts.loc();
    if (ts.consumeIfNextIs("return")) {
        return A.buildExprStmt(parseReturnExpr(ts, level, loc));
    }
    else if (ts.nextIs("if")) {
        return A.buildExprStmt(parseIfExpr(ts, level, true));
    }
    else if (ts.nextIs("*")) {
        return parseVarAssignment(ts, level, parseDereferenceExpr(ts));
    }
    else {
        const ide = parseIDExpr(ts);
        if (ts.nextIs("(")) {
            const fa = parseFunctionApplication(ts, level, ide);
            if (ts.nextIs(";")) {
                return A.buildExprStmt(fa);
            }
            else {
                const ae: A.ArrayExpr = {
                    nodeType: NodeType.ArrayExpr,
                    id: fa.id,
                    args: fa.args,
                    type: KnownTypes.NotInferred,
                    loc: loc,
                };

                return parseVarAssignment(ts, level, ae);
            }
        }
        else {
            return parseVarAssignment(ts, level, ide);
        }
    }
}

function parseBlockExpr(ts: TokenStream, level: number): A.BlockExpr {
    level += 1;
    const xs = new Array<any>();
    const loc = ts.loc();

    while (!ts.nextIs("}")) {
        if (ts.nextIs("let")) {
            xs.push(parseVarInit(ts, level, false));
        }
        else if (ts.nextIs("var")) {
            xs.push(parseVarInit(ts, level, true));
        }
        else if (ts.nextIs("for")) {
            xs.push(parseForStmt(ts, level));
        }
        else {
            xs.push(parseAssnOrExprStmt(ts, level));
        }

        ts.nextMustBe(";");
    }
    return {
        nodeType: NodeType.BlockExpr,
        xs: xs,
        level: level,
        type: KnownTypes.NotInferred,
        loc: loc,
    };
}

function parseVarDef(ts: TokenStream, isMutable: boolean, force: boolean): P.Variable {
    const loc = ts.loc();
    const id = parseID(ts);
    const type = parseVarType(ts, force);
    return {
        id: id,
        type: type,
        isMutable: isMutable,
        loc: loc,
    }
}

function parseVariableList(ts: TokenStream, isMutable: boolean) {
    const xs = new Array<P.Parameter>();
    while (ts.peek().lexeme !== ")") {
        xs.push(parseVarDef(ts, isMutable, true));
        if (ts.peek().lexeme === ")") continue;
        ts.nextMustBe(",");
    }
    return xs;
}

function parseParameterList(ts: TokenStream) {
    return parseVariableList(ts, false);
}

function parseStructMemberList(ts: TokenStream) {
    return parseVariableList(ts, false);
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
            return KnownTypes.NotInferred;
        }
    }
}

function parseFunctionPrototype(ts: TokenStream) {
    const loc = ts.loc();
    ts.nextMustBe("fn");
    const id = parseID(ts);
    ts.nextMustBe("(");
    const xs = parseParameterList(ts);
    ts.nextMustBe(")");
    let type = parseVarType(ts, false);

    return {
        id: id,
        params: xs,
        type: type,
        loc: loc,
    };
}

function parseFunction(ts: TokenStream): P.Function {
    const loc = ts.loc();
    const fp = parseFunctionPrototype(ts);
    ts.nextMustBe("{");
    const body = parseBlockExpr(ts, -1);
    ts.nextMustBe("}");

    return {
        proto: fp,
        body: body,
        loc: loc,
    };
}

function parseForeignFunction(ts: TokenStream): P.ForeignFunction {
    const loc = ts.loc();
    ts.nextMustBe("foreign");
    const fp = parseFunctionPrototype(ts);

    return {
        proto: fp,
        loc: loc,
    };
}

function parseStruct(ts: TokenStream): P.Struct {
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

export function parseModule(ts: TokenStream, path: string) {
    const xs = new Array<P.Struct>();
    const ys = new Array<P.ForeignFunction>();
    const zs = new Array<P.Function>();
    while (!ts.eof()) {
        if (ts.nextIs("struct")) {
            xs.push(parseStruct(ts));
        }
        else if (ts.nextIs("foreign")) {
            ys.push(parseForeignFunction(ts));
        }
        else if (ts.nextIs("fn")) {
            zs.push(parseFunction(ts));
        }
        else {
            Errors.raiseDebug();
        }
    }

    return {
        path: path,
        structs: xs,
        foreignFunctions: ys,
        functions: zs,
    };
}

export default function parse(f: SourceFile) {
    Logger.info(`Parsing: ${f.path}`);
    const cs = CharacterStream.build(f.contents, f.fsPath);
    const ts = lex(cs);
    return parseModule(ts, f.path);
}