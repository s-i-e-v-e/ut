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
type Type = P.Type;

function parseIDExpr(ts: TokenStream): A.IDExpr {
    const loc = ts.loc();
    const id = ts.nextMustBe(TokenType.TK_ID).lexeme;

    return {
        nodeType: NodeType.IDExpr,
        id: id,
        loc: loc,
        type: KnownTypes.NotInferred,
    }
}

function parseMultiIDExpr(ts: TokenStream): A.IDExpr {
    if (ts.nextIsID()) return parseIDExpr(ts);
    const loc = ts.loc();
    const t = ts.nextMustBe(TokenType.TK_MULTI_ID);

    return {
        nodeType: NodeType.IDExpr,
        id: t.lexeme,
        rest: t.xs!.join("."),
        loc: loc,
        type: KnownTypes.NotInferred,
    };
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
    n = n.replace(/_/g, "");
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

function parseExprList(ts: TokenStream, block: A.BlockExpr) {
    const xs = new Array<any>();
    while (!ts.nextIs(")")) {
        xs.push(parseRExpr(ts, block));
        if (!ts.consumeIfNextIs(",")) break;
    }
    return xs;
}

function parseTypeConstructor(ts: TokenStream, block: A.BlockExpr): A.ArrayConstructor {
    const loc = ts.loc();
    const ty = parseType(ts);
    if (ty.id === "Array") {
        // is array constructor
        const t = ts.peek();
        ts.nextMustBe("(");
        let sizeExpr = undefined;
        let args = undefined;
        if (ts.consumeIfNextIs("#")) {
            sizeExpr = parseRExpr(ts, block);
        }
        else {
            args = parseExprList(ts, block);
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

function parseIfExpr(ts: TokenStream, block: A.BlockExpr, isStmt: boolean): A.IfExpr {
    const mustReturn = (be: A.BlockExpr) => {
        // last statement must be a return
        const last = be.xs.length ? be.xs[be.xs.length - 1] : undefined;
        if (last && last.nodeType === NodeType.ExprStmt) {
            const es = (last as A.ExprStmt);
            const e = {
                nodeType: NodeType.LocalReturnExpr,
                expr: es.expr,
                loc: es.loc,
            } as A.LocalReturnExpr;
            es.expr = e;
            if (e.expr.nodeType == NodeType.IfExpr) {
                const x = e.expr as A.IfExpr;
                mustReturn(x.ifBranch);
                mustReturn(x.elseBranch);
            }
        }
        else {
            Errors.raiseIfExprMustReturn(be.loc);
        }
    };

    const loc = ts.loc();
    ts.nextMustBe("if");
    ts.nextMustBe("(");
    const cond = parseRExpr(ts, block);
    ts.nextMustBe(")");
    const ifBranch = parseBlockExpr(ts, block);
    ts.nextMustBe("else");
    const elseBranch = parseBlockExpr(ts, block);

    if (!isStmt) mustReturn(ifBranch);
    if (!isStmt) mustReturn(elseBranch);
    return {
        nodeType: NodeType.IfExpr,
        condition: cond,
        ifBranch: ifBranch,
        elseBranch: elseBranch,
        loc: loc,
        type: KnownTypes.NotInferred,
    };
}

function parseFunctionApplication(ts: TokenStream, block: A.BlockExpr, ide: A.IDExpr): A.FunctionApplication {
    ts.nextMustBe("(");
    const xs = parseExprList(ts, block);
    ts.nextMustBe(")");
    return {
        nodeType: NodeType.FunctionApplication,
        expr: ide,
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

function parseReferenceExpr(ts: TokenStream, block: A.BlockExpr): A.ReferenceExpr {
    const loc = ts.loc();
    ts.nextMustBe("&");
    return {
        nodeType: NodeType.ReferenceExpr,
        expr: parseLExpr(ts, block),
        loc: loc,
        type: KnownTypes.NotInferred,
    };
}

function parseDereferenceExpr(ts: TokenStream): A.DereferenceExpr {
    const loc = ts.loc();
    ts.nextMustBe("*");
    const e = ts.nextIs("*") ? parseDereferenceExpr(ts) :  parseMultiIDExpr(ts);
    return {
        nodeType: NodeType.DereferenceExpr,
        expr: e,
        loc: loc,
        type: KnownTypes.NotInferred,
    };
}

function parseLExpr(ts: TokenStream, block: A.BlockExpr): Expr {
    let e;
    if (ts.nextIs("*")) {
        e = parseDereferenceExpr(ts);
    }
    else {
        const ide = parseMultiIDExpr(ts);
        if (ts.nextIs("(")) {
            e = parseFunctionApplication(ts, block, ide);
        }
        else {
            e = ide;
        }
    }
    return e;
}

function _parseRExpr(ts: TokenStream, block: A.BlockExpr, e1?: Expr, op?: string): Expr {
    let e;
    if (ts.nextIsLiteral()) {
        e = parseLiteral(ts);
    }
    else if (ts.nextIsType()) {
        e = parseTypeConstructor(ts, block);
    }
    else if (ts.nextIs("if")) {
        e = parseIfExpr(ts, block, false);
    }
    else if (ts.nextIs("&")) {
        e = parseReferenceExpr(ts, block);
    }
    else {
        e = parseLExpr(ts, block);
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

function parseRExpr(ts: TokenStream, block: A.BlockExpr, precedence?: number, e1?: Expr, op?: string): Expr {
    precedence = precedence || 0;
    const e = e1 && !op ? e1 : _parseRExpr(ts, block, e1, op);

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
        return parseRExpr(ts, block, opx.precedence, e, opx.op);
    }
    else {
        return A.buildBinaryExpr(e, opx.op, parseRExpr(ts, block, precedence));
    }
}

function parseVarInit(ts: TokenStream, block: A.BlockExpr, isMutable: boolean): A.VarInitStmt  {
    const loc = ts.loc();
    ts.nextMustBe(isMutable ? "var" : "let");
    const v = parseVarDef(ts, isMutable, false);
    ts.nextMustBe("=");
    const expr = parseRExpr(ts, block);
    return {
        nodeType: NodeType.VarInitStmt,
        var: v,
        expr: expr,
        loc: loc,
    }
}

function rewriteBinaryExpr(e: A.BinaryExpr) {
    // rewrite
    let le = e.left;
    let re = undefined;
    switch (e.op) {
        case "+=": e.op = "+"; break;
        case "-=": e.op = "-"; break;
        case "*=": e.op = "*"; break;
        case "/=": e.op = "/"; break;
        case "%=": e.op = "%"; break;
        case "&=": e.op = "&"; break;
        case "|=": e.op = "|"; break;
        case "=": re = e.right; break;
        default: Errors.raiseDebug(e.op+":"+e.loc.line);
    }
    re = re === undefined ? e : re;

    return A.buildVarAssnStmt(le, re);
}

function parseVarAssignment(ts: TokenStream, block: A.BlockExpr, le: Expr): A.VarAssnStmt {
    if (ts.consumeIfNextIs("=")) {
        return A.buildVarAssnStmt(le, parseRExpr(ts, block));
    }
    else {
        const e = parseRExpr(ts, block, 0, le) as A.BinaryExpr;
        if (!e.op) Errors.raiseDebug();
        if (le !== e.left) Errors.raiseDebug();
        return rewriteBinaryExpr(e);
    }
}

function parseForStmt(ts: TokenStream, block: A.BlockExpr): A.ForStmt {
    const loc = ts.loc();
    ts.nextMustBe("for");
    ts.nextMustBe("(");
    const init = ts.consumeIfNextIs(";") ? undefined : parseVarInit(ts, block, true);
    if (init) ts.nextMustBe(";");
    const condition = ts.consumeIfNextIs(";") ? undefined : parseRExpr(ts, block);
    if (condition) ts.nextMustBe(";");
    const update = ts.nextIs(")") ? undefined : parseVarAssignment(ts, block, parseMultiIDExpr(ts));
    ts.nextMustBe(")");
    const body = parseBlockExpr(ts, block);

    return {
        nodeType: NodeType.ForStmt,
        init: init,
        condition: condition,
        update: update,
        body: body,
        loc: loc,
    };
}

function parseReturnExpr(ts: TokenStream, block: A.BlockExpr, loc: Location): A.ReturnExpr {
    return {
        nodeType: NodeType.ReturnExpr,
        expr: ts.nextIs(";") ? A.buildVoidExpr(loc) : parseRExpr(ts, block),
        type: KnownTypes.NotInferred,
        loc: loc,
    };
}

function parseAssnOrExprStmt(ts: TokenStream, block: A.BlockExpr) {
    const loc = ts.loc();
    if (ts.consumeIfNextIs("return")) {
        return A.buildExprStmt(parseReturnExpr(ts, block, loc));
    }
    else if (ts.nextIs("if")) {
        return A.buildExprStmt(parseIfExpr(ts, block, true));
    }
    else if (ts.nextIs("*")) {
        return parseVarAssignment(ts, block, parseDereferenceExpr(ts));
    }
    else if (ts.nextIs("{")) {
        return A.buildExprStmt(parseBlockExpr(ts, block));
    }
    else {
        const e = parseRExpr(ts, block);
        if (ts.nextIs(";")) {
            const c = e as A.BinaryExpr;
            if (c.op) {
                return rewriteBinaryExpr(c);
            }
            else {
                return A.buildExprStmt(e);
            }
        }

        if (e.nodeType !== NodeType.IDExpr) Errors.raiseDebug();
        const ide = e as A.IDExpr;
        if (ts.nextIs("(")) {
            const fa = parseFunctionApplication(ts, block, ide);
            if (ts.nextIs(";")) {
                return A.buildExprStmt(fa);
            }
            else {
                const ae: A.ArrayExpr = {
                    nodeType: NodeType.ArrayExpr,
                    expr: fa.expr,
                    args: fa.args,
                    type: KnownTypes.NotInferred,
                    loc: loc,
                };

                return parseVarAssignment(ts, block, ae);
            }
        }
        else {
            return parseVarAssignment(ts, block, ide);
        }
    }
}

function parseBlockExpr(ts: TokenStream, block?: A.BlockExpr): A.BlockExpr {
    const loc = ts.loc();
    ts.nextMustBe("{");
    block = buildBlockExpr(loc, block);
    const xs = block.xs;

    while (!ts.nextIs("}")) {
        if (ts.nextIs("let")) {
            xs.push(parseVarInit(ts, block, false));
        }
        else if (ts.nextIs("var")) {
            xs.push(parseVarInit(ts, block, true));
        }
        else if (ts.nextIs("for")) {
            xs.push(parseForStmt(ts, block));
        }
        else {
            xs.push(parseAssnOrExprStmt(ts, block));
        }

        ts.nextMustBe(";");
    }
    ts.nextMustBe("}");
    return block;
}

function parseVarDef(ts: TokenStream, isMutable: boolean, force: boolean): P.Variable {
    const loc = ts.loc();
    const id = parseIDExpr(ts).id;
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
    const id = parseIDExpr(ts).id;
    ts.nextMustBe("(");
    const xs = parseParameterList(ts);
    ts.nextMustBe(")");
    let type = parseVarType(ts, false);

    return {
        id: id,
        params: xs,
        type: type,
        loc: loc,
        mangledName: P.mangleName(id, xs.map(x => x.type)),
    };
}

export function buildBlockExpr(loc: Location, parent?: A.BlockExpr): A.BlockExpr  {
    return {
        nodeType: NodeType.BlockExpr,
        type: KnownTypes.NotInferred,
        loc: loc,
        xs: new Array<any>(),
        parent: parent,
    };
}

function parseFunction(ts: TokenStream): P.Function {
    const loc = ts.loc();
    const fp = parseFunctionPrototype(ts);
    const body = parseBlockExpr(ts);

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