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
    ArrayConstructor,
    ArrayExpr,
    BinaryExpr,
    ForeignFunction,
    Function,
    IDExpr,
    KnownTypes,
    Location,
    NodeType,
    Parameter,
    Stmt,
    Struct,
    Type,
    Expr,
} from "./mod.ts";
import {
    Errors,
    Logger,
    Dictionary,
    SourceFile,
} from "../util/mod.ts";

function parseID(ts: TokenStream) {
    return ts.nextMustBe(TokenType.TK_ID).lexeme;
}

function parseIDExpr(ts: TokenStream): IDExpr {
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

function parseExprList(ts: TokenStream) {
    const xs = new Array<any>();
    while (!ts.nextIs(")")) {
        xs.push(parseExpr(ts));
        if (!ts.consumeIfNextIs(",")) break;
    }
    return xs;
}

function parseTypeConstructor(ts: TokenStream): ArrayConstructor {
    const loc = ts.loc();
    const ty: Type = parseType(ts);
    if (ty.id === "Array") {
        // is array constructor
        const t = ts.peek();
        ts.nextMustBe("(");
        let sizeExpr = undefined;
        let args = undefined;
        if (ts.consumeIfNextIs("#")) {
            sizeExpr = parseExpr(ts);
        }
        else {
            args = parseExprList(ts);
            if (!args.length) Errors.raiseArrayInitArgs(t);
        }
        ts.nextMustBe(")");
        return <ArrayConstructor>{
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

function parseIfExpr(ts: TokenStream, isStmt: boolean) {
    const mustReturn = (xs: Stmt[], loc: Location) => {
        // last statement must be a return
        const last = xs.length ? xs[xs.length - 1] : undefined;
        if (last && last.nodeType === NodeType.ReturnStmt) {
            last.nodeType = NodeType.ReturnExpr;
        }
        else {
            Errors.raiseIfExprMustReturn(loc);
        }
    };

    const loc = ts.loc();
    ts.nextMustBe("if");
    ts.nextMustBe("(");
    const cond = parseExpr(ts);
    ts.nextMustBe(")");
    ts.nextMustBe("{");
    const l1 = ts.loc();
    const ifBranch = parseBody(ts);
    ts.nextMustBe("}");
    ts.nextMustBe("else");
    ts.nextMustBe("{");
    const l2 = ts.loc();
    const elseBranch = parseBody(ts);
    ts.nextMustBe("}");

    if (!isStmt) mustReturn(ifBranch, l1);
    if (!isStmt) mustReturn(elseBranch, l2);
    return {
        nodeType: NodeType.IfExpr,
        condition: cond,
        ifBranch: ifBranch,
        elseBranch: elseBranch,
        loc: loc,
        returnType: KnownTypes.NotInferred,
    };
}

function parseFunctionApplication(ts: TokenStream, ide: IDExpr) {
    ts.nextMustBe("(");
    const xs = parseExprList(ts);
    ts.nextMustBe(")");
    return {
        nodeType: NodeType.FunctionApplication,
        id: ide.id,
        args: xs,
        loc: ide.loc,
    };
}

function parseBinaryExpr(ts: TokenStream, precedence: number, e1: IDExpr, op: string): BinaryExpr {
    return <BinaryExpr>parseExpr(ts, precedence, e1, op);
}

function buildBinaryExpr(left: any, op: string, right: any) {
    return {
        nodeType: NodeType.BinaryExpr,
        left: left,
        op: op,
        right: right,
        loc: left.loc,
    };
}

function parseCastExpr(ts: TokenStream, e: any) {
    ts.nextMustBe("as");
    return {
        nodeType: NodeType.CastExpr,
        expr: e,
        loc: e.loc,
        type: parseType(ts),
    };
}

function parseReferenceExpr(ts: TokenStream) {
    const loc = ts.loc();
    ts.nextMustBe("&");
    return {
        nodeType: NodeType.ReferenceExpr,
        expr: parseExpr(ts),
        loc: loc,
    };
}

function parseDereferenceExpr(ts: TokenStream) {
    const loc = ts.loc();
    ts.nextMustBe("*");
    return {
        nodeType: NodeType.DereferenceExpr,
        expr: parseIDExpr(ts),
        loc: loc,
        type: KnownTypes.NotInferred,
    };
}

function _parseExpr(ts: TokenStream, e1?: Expr, op?: string): any {
    let e;
    if (ts.nextIsLiteral()) {
        e = parseLiteral(ts);
    }
    else if (ts.nextIsType()) {
        e = parseTypeConstructor(ts);
    }
    else if (ts.nextIs("if")) {
        e = parseIfExpr(ts, false);
    }
    else if (ts.nextIs("&")) {
        e = parseReferenceExpr(ts);
    }
    else if (ts.nextIs("*")) {
        e = parseDereferenceExpr(ts);
    }
    else {
        const ide = parseIDExpr(ts);
        if (ts.nextIs("(")) {
            e = parseFunctionApplication(ts, ide);
        }
        else {
            e = ide;
        }
    }

    if (e1) {
        e = buildBinaryExpr(e1, op!, e);
    }
    else {
        // ignore
    }

    if (ts.nextIs("as")) {
        e = parseCastExpr(ts, e);
    }
    return e;
}

function parseExpr(ts: TokenStream, precedence?: number, e1?: Expr, op?: string): any {
    precedence = precedence || 0;
    const e = e1 && !op ? e1 : _parseExpr(ts, e1, op);

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
        return parseBinaryExpr(ts, opx.precedence, e, opx.op);
    }
    else {
        return buildBinaryExpr(e, opx.op, parseExpr(ts, precedence));
    }
}

function parseVarDef(ts: TokenStream, isMutable: boolean, force: boolean) {
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

function parseVarInit(ts: TokenStream, isMutable: boolean) {
    if (isMutable) {
        ts.nextMustBe("var");
    }
    else {
        ts.nextMustBe("let");
    }
    const loc = ts.loc();
    const v = parseVarDef(ts, isMutable, false);
    ts.nextMustBe("=");
    const expr = parseExpr(ts);
    return {
        nodeType: NodeType.VarInitStmt,
        var: v,
        expr: expr,
        loc: loc,
    }
}

function parseForStmt(ts: TokenStream) {
    const loc = ts.loc();
    ts.nextMustBe("for");
    ts.nextMustBe("(");
    const init = ts.consumeIfNextIs(";") ? undefined : parseVarInit(ts, true);
    if (init) ts.nextMustBe(";");
    const condition = ts.consumeIfNextIs(";") ? undefined : parseExpr(ts);
    if (condition) ts.nextMustBe(";");
    const update = ts.nextIs(")") ? undefined : parseVarAssignment(ts, parseIDExpr(ts));
    ts.nextMustBe(")");
    ts.nextMustBe("{");
    const body = parseBody(ts);
    ts.nextMustBe("}");

    return {
        nodeType: NodeType.ForStmt,
        init: init,
        condition: condition,
        update: update,
        body: body,
        loc: loc,
    }
}

function parseVarAssignment(ts: TokenStream, lhs: Expr) {
    if (ts.consumeIfNextIs("=")) {
        return {
            nodeType: NodeType.VarAssnStmt,
            lhs: lhs,
            rhs: parseExpr(ts),
            loc: lhs.loc,
        };
    }
    else {
        const e = parseExpr(ts, 0, lhs) as BinaryExpr;

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

        return {
            nodeType: NodeType.VarAssnStmt,
            lhs: lhs,
            rhs: e,
            loc: lhs.loc,
        };
    }
}

function parseBody(ts: TokenStream) {
    const xs = new Array<any>();

    while (!ts.nextIs("}")) {
        const loc = ts.loc();
        if (ts.nextIs("let")) {
            xs.push(parseVarInit(ts, false));
        }
        else if (ts.nextIs("var")) {
            xs.push(parseVarInit(ts, true));
        }
        else if (ts.consumeIfNextIs("return")) {
            xs.push({
                nodeType: NodeType.ReturnStmt,
                expr: parseExpr(ts),
                loc: loc,
            });
        }
        else if (ts.nextIs("if")) {
            xs.push({
                nodeType: NodeType.IfStmt,
                ie: parseIfExpr(ts, true),
                loc: loc,
            });
        }
        else if (ts.nextIs("for")) {
            xs.push(parseForStmt(ts));
        }
        else {
            if (ts.nextIs("*")) {
                const e = parseDereferenceExpr(ts);
                xs.push(parseVarAssignment(ts, e));
            }
            else {
            const ide = parseIDExpr(ts);
            if (ts.nextIs("(")) {
                const fa = parseFunctionApplication(ts, ide);
                if (ts.nextIs(";")) {
                    xs.push({
                        nodeType: NodeType.FunctionApplicationStmt,
                        fa: fa,
                        loc: ide.loc,
                    });
                }
                else {
                    const ae = fa as ArrayExpr;
                    ae.nodeType = NodeType.ArrayExpr;
                    ae.isLeft = true;
                    xs.push(parseVarAssignment(ts, ae));
                }
            }
            else {
                xs.push(parseVarAssignment(ts, ide));
            }
            }
        }
        ts.nextMustBe(";");
    }
    return xs;
}

function parseVariableList(ts: TokenStream, isMutable: boolean) {
    const xs = new Array<Parameter>();
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
    let returnType = parseVarType(ts, false);

    return {
        id: id,
        params: xs,
        returnType: returnType,
        loc: loc,
    };
}

function parseFunction(ts: TokenStream): Function {
    const loc = ts.loc();
    const fp = parseFunctionPrototype(ts);
    ts.nextMustBe("{");
    const body = parseBody(ts);
    ts.nextMustBe("}");

    return {
        proto: fp,
        body: body,
        loc: loc,
    };
}

function parseForeignFunction(ts: TokenStream): ForeignFunction {
    const loc = ts.loc();
    ts.nextMustBe("foreign");
    const fp = parseFunctionPrototype(ts);

    return {
        proto: fp,
        loc: loc,
    };
}

function parseStruct(ts: TokenStream): Struct {
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
    const xs = new Array<Struct>();
    const ys = new Array<ForeignFunction>();
    const zs = new Array<Function>();
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