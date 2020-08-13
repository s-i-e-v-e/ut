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
    A,
} from "./mod.ts";
import {
    Errors,
    Logger,
    Dictionary,
    SourceFile, clone, Int,
} from "../util/mod.ts";

type Location = A.Location;
const NodeType = A.NodeType;
type Expr = A.Expr;
type Type = A.Type;

function parseIDExpr(ts: TokenStream): A.IDExpr {
    const loc = ts.loc();
    const id = ts.nextMustBe(TokenType.TK_ID, "ID").lexeme;

    return {
        nodeType: NodeType.IDExpr,
        id: id,
        loc: loc,
        type: A.Compiler.NotInferred,
        rest: [],
    }
}

function parseMultiIDExpr(ts: TokenStream): A.IDExpr {
    if (ts.nextIsID()) return parseIDExpr(ts);
    const loc = ts.loc();
    const t = ts.nextMustBe(TokenType.TK_MULTI_ID, "ID");

    return {
        nodeType: NodeType.IDExpr,
        id: t.lexeme,
        rest: t.xs,
        loc: loc,
        type: A.Compiler.NotInferred,
    };
}

function parseTypeIDExpr(ts: TokenStream): A.IDExpr {
    const loc = ts.loc();
    const t = parseTypeID(ts);
    return {
        nodeType: NodeType.IDExpr,
        id: t,
        rest: [],
        loc: loc,
        type: A.Compiler.NotInferred,
    };
}

/** TYPE FUNCTIONS **/
function parseTypeParameterID(ts: TokenStream) {
    const t = ts.nextMustBe(TokenType.TK_TYPE, "TYPE");
    if (t.lexeme.length !== 1) Errors.Parser.parserError("Type parameters must be single characters", t);
    return t.lexeme;
}

function parseTypeID(ts: TokenStream, isDef: boolean = false) {
    if (A.LanguageMap[ts.peek().lexeme]) return parseIDExpr(ts).id;
    const t = ts.nextMustBe(TokenType.TK_TYPE, "TYPE");
    if (isDef && t.lexeme.length <= 1) Errors.Parser.parserError("Single character type names are reserved for type params", t);
    return t.lexeme;
}

function parseTypeDeclID(ts: TokenStream) {
    return parseTypeID(ts, true);
}

// struct Array[A]
// struct Map[A, B]
function parseTypeDeclParameters(ts: TokenStream) {
    if (!ts.consumeIfNextIs("[")) return [];

    const xs = new Array<string>();
    while (!ts.nextIs("]")) {
        xs.push(parseTypeParameterID(ts));
        if (!ts.consumeIfNextIs(",")) break;
    }
    ts.nextMustBe("]");
    return xs;
}

function parseType(ts: TokenStream, e?: A.IDExpr): A.ParametricType {
    const parseTypeParameters = (ts: TokenStream) => {
        if (!ts.consumeIfNextIs("[")) return [];
        const xs = new Array<Type>();
        while (!ts.nextIs("]")) {
            xs.push(parseType(ts));
            if (!ts.consumeIfNextIs(",")) break;
        }
        ts.nextMustBe("]");
        return xs;
    };

    const loc = ts.loc();
    const idx = ts.getIndex();
    const id =  e ? e.id : (ts.nextIs("[") ? A.Compiler.Array.id : parseTypeID(ts));
    return A.newParametricType(id, loc, parseTypeParameters(ts));
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

    let sum = Int(0);
    for (let i = 0; i < n.length; i += 1) {
        const d = n.charAt(n.length - i - 1);
        sum += Int(NumGrid[d] * (radix ** i));
    }
    sum = isKilo ? sum * Int(1024) : sum;
    return {
        nodeType: NodeType.NumberLiteral,
        value: sum,
        type: A.Language.u64,
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
            type: A.Language.string,
            loc: loc,
        };
        case TokenType.TK_BOOLEAN_LITERAL: return {
            nodeType: NodeType.BooleanLiteral,
            value: t.lexeme === "true",
            type: A.Language.bool,
            loc: loc,
        };
        case TokenType.TK_BINARY_NUMBER_LITERAL: return parseNumber(t.lexeme, 2, loc);
        case TokenType.TK_OCTAL_NUMBER_LITERAL: return parseNumber(t.lexeme, 8, loc);
        case TokenType.TK_HEXADECIMAL_NUMBER_LITERAL: return parseNumber(t.lexeme, 16, loc);
        case TokenType.TK_DECIMAL_NUMBER_LITERAL: return parseNumber(t.lexeme, 10, loc);
        default: return Errors.Parser.raiseExpectedButFound("Number/String/Bool literal", t);
    }
}

function parseExprList(ts: TokenStream, block: A.BlockExpr) {
    const xs = new Array<any>();
    while (!ts.nextIs(")")) {
        xs.push(parseExpr(ts, block));
        if (!ts.consumeIfNextIs(",")) break;
    }
    return xs;
}

function parseIfExpr(ts: TokenStream, block: A.BlockExpr): A.IfExpr {
    const loc = ts.loc();
    ts.nextMustBe("if");
    ts.nextMustBe("(");
    const cond = parseExpr(ts, block);
    ts.nextMustBe(")");
    const ifBranch = parseBlockExpr(ts, block);
    ts.nextMustBe("else");
    const elseBranch = parseBlockExpr(ts, block);

    return {
        nodeType: NodeType.IfExpr,
        condition: cond,
        ifBranch: ifBranch,
        elseBranch: elseBranch,
        loc: loc,
        type: A.Compiler.NotInferred,
        isStmt: false,
    };
}

function parseFunctionApplication(ts: TokenStream, block: A.BlockExpr, e: A.IDExpr): A.FunctionApplication {
    const ty = parseType(ts, e);
    ts.nextMustBe("(");
    const xs = parseExprList(ts, block);
    ts.nextMustBe(")");
    return {
        loc: e.loc,
        nodeType: NodeType.FunctionApplication,
        type: A.Compiler.NotInferred,
        expr: e,
        typeParams: ty.typeParams,
        args: xs,
    };
}

function parseNegationExpr(ts: TokenStream, block: A.BlockExpr): A.ReferenceExpr {
    const loc = ts.loc();
    ts.nextMustBe("!");
    return {
        nodeType: NodeType.NegationExpr,
        expr: parseExpr(ts, block),
        loc: loc,
        type: A.Compiler.NotInferred,
    };
}

function parseCastExpr(ts: TokenStream, e: Expr): A.CastExpr {
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
        expr: parseExpr(ts, block),
        loc: loc,
        type: A.Compiler.NotInferred,
    };
}

function parseDereferenceExpr(ts: TokenStream, block: A.BlockExpr): A.DereferenceExpr {
    const loc = ts.loc();
    ts.nextMustBe("*");
    const e = ts.nextIs("*") ? parseDereferenceExpr(ts, block) : parseExpr(ts, block, OperatorPrecedence["*"]);
    return {
        nodeType: NodeType.DereferenceExpr,
        expr: e,
        loc: loc,
        type: A.Compiler.NotInferred,
    };
}

function parseGroupExpr(ts: TokenStream, block: A.BlockExpr): A.GroupExpr {
    const loc = ts.loc();
    ts.nextMustBe("(");
    const e = parseExpr(ts, block);
    ts.nextMustBe(")");
    return {
        nodeType: NodeType.GroupExpr,
        expr: e,
        loc: loc,
        type: A.Compiler.NotInferred,
    };
}

const OperatorPrecedence: Dictionary<number> = {
    ":": 110,
    "*": 100,
    "/": 100,
    "%": 100,
    "+": 90,
    "-": 90,
    ">": 80,
    "<": 80,
    ">=": 80,
    "<=": 80,
    "!=": 70,
    "==": 70,
    "&": 60,
    "|": 60,

    "*=": 10,
    "/=": 10,
    "%=": 10,
    "+=": 10,
    "-=": 10,
    "&=": 10,
    "|=": 10,

    "=": 10,
    ";": 0,
};

function parseExpr(ts: TokenStream, block: A.BlockExpr, rbp: number = 0, le?: Expr): Expr {
    const operator = (rbp: number): [string, number] => {
        const o1 = ts.peek().lexeme;
        const o2 = o1 ? o1 + ts.peek(1).lexeme : o1;
        if (rbp < OperatorPrecedence[o2]) {
            ts.next();
            ts.next();
            return [o2, OperatorPrecedence[o2] || 0]
        }
        else if (rbp < OperatorPrecedence[o1]) {
            ts.next();
            return [o1, OperatorPrecedence[o1] || 0]
        }
        else {
            return ["", 0];
        }
    };

    const expr = (rbp: number, left?: Expr): Expr => {
        left = left || nud(ts.peek().lexeme);
        while (true) {
            let [op, lbp] = operator(rbp);
            if (lbp) {
                left = led(op, lbp, left);
            }
            else {
                break;
            }
        }
        return left;
    }

    // left-bound expr
    const led = (op: string, lbp: number, le: Expr) => {
        switch (op) {
            case ":": return parseCastExpr(ts, le);
            case ";": return {
                nodeType: NodeType.StmtExpr,
                loc: le.loc,
                type: A.Compiler.NotInferred,
                stmt: A.buildExprStmt(le, le.loc),
            };
            default: {
                return A.buildBinaryExpr(le, op, expr(lbp));
            }
        }
    };

    // prefix expr
    const nud = (op: string): Expr => {
        switch (op) {
            case "&": {
                return parseReferenceExpr(ts, block);
            }
            case "!": {
                return parseNegationExpr(ts, block);
            }
            case "*": {
                return parseDereferenceExpr(ts, block);
            }
            case "(": {
                return parseGroupExpr(ts, block);
            }
            case "{": {
                return parseBlockExpr(ts, block);
            }
            case "if": {
                return parseIfExpr(ts, block);
            }
            default: {
                if (ts.nextIsLiteral()) {
                    return parseLiteral(ts);
                }
                else {
                    const e = ts.nextIsType() ? parseTypeIDExpr(ts) : parseMultiIDExpr(ts);
                    if (ts.nextIs("(") || ts.nextIs("[")) {
                        return parseFunctionApplication(ts, block, e);
                    }
                    else {
                        return e;
                    }
                }
            }
        }
    };
    return expr(rbp, le);
}

function parseVarInit(ts: TokenStream, block: A.BlockExpr, isMutable: boolean): A.VarInitStmt  {
    const loc = ts.loc();
    ts.nextMustBe(isMutable ? "var" : "let");
    const v = parseVarDef(ts, isMutable, false, false);
    ts.nextMustBe("=");
    const expr = parseExpr(ts, block);
    return {
        nodeType: NodeType.VarInitStmt,
        var: v,
        expr: expr,
        loc: loc,
    }
}

function parseAssnOrExprStmt(ts: TokenStream, block: A.BlockExpr) {
    const e = parseExpr(ts, block) as A.BinaryExpr;
    if (e.op === undefined) return A.buildExprStmt(e);
    if (e.op === ";") return A.buildExprStmt(e.left);
    return parseVarAssignment(ts, block, e);
}

function parseVarAssignment(ts: TokenStream, block: A.BlockExpr, x?: Expr): A.VarAssnStmt {
    const e = (x || parseExpr(ts, block)) as A.BinaryExpr;
    switch (e.op) {
        case "*=":
        case "/=":
        case "%=":
        case "+=":
        case "-=":
        case "&=":
        case "|=": {
            e.op = e.op.charAt(0);
            return A.buildVarAssnStmt(e.left, e);
        }
        case "=": {
            return A.buildVarAssnStmt(e.left, e.right);
        }
        default: {
            return Errors.Parser.raiseExpectedButFound("one of: */%+-&|;", {
                lexeme: e.op,
                type: TokenType.TK_INTERNAL,
                loc: e.loc,
                xs: [],
            });
        }
    }
}

function parseForStmt(ts: TokenStream, block: A.BlockExpr): A.ForStmt {
    const loc = ts.loc();
    ts.nextMustBe("for");
    ts.nextMustBe("(");
    const init = ts.consumeIfNextIs(";") ? undefined : parseVarInit(ts, block, true);
    if (init) ts.nextMustBe(";");
    const condition = ts.consumeIfNextIs(";") ? undefined : parseExpr(ts, block);
    if (condition) ts.nextMustBe(";");
    const update = ts.nextIs(")") ? undefined : parseVarAssignment(ts, block);
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

function parseReturnStmt(ts: TokenStream, block: A.BlockExpr, loc: Location): A.ReturnStmt {
    return {
        nodeType: NodeType.ReturnStmt,
        expr: ts.nextIs(";") ? A.buildVoidExpr(loc) : parseExpr(ts, block),
        loc: loc,
    };
}

function parseBlockExpr(ts: TokenStream, block?: A.BlockExpr): A.BlockExpr {
    const loc = ts.loc();
    ts.nextMustBe("{");
    block = A.buildBlockExpr(loc, block);
    const xs = block.xs;

    while (!ts.nextIs("}")) {
        if (ts.nextIs("let")) {
            xs.push(parseVarInit(ts, block, false));
        }
        else if (ts.nextIs("var")) {
            xs.push(parseVarInit(ts, block, true));
        }
        else if (ts.consumeIfNextIs("return")) {
            xs.push(parseReturnStmt(ts, block, loc));
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

function parseVarDef(ts: TokenStream, isMutable: boolean, isPrivate: boolean, force: boolean): A.Variable {
    const loc = ts.loc();
    const id = parseIDExpr(ts).id;
    const type = parseVarType(ts, force);
    const isVararg = ts.consumeIfNextIs("*") !== undefined;
    return A.buildVar(
        id,
        type,
        isMutable,
        isVararg,
        isPrivate,
        loc,
    );
}

function parseVariableList(ts: TokenStream, isMutable: boolean, canBePrivate: boolean) {
    const xs = new Array<A.Variable>();
    while (ts.peek().lexeme !== ")") {
        const isPrivate = canBePrivate && ts.consumeIfNextIs("#") !== undefined;
        xs.push(parseVarDef(ts, isMutable, isPrivate, true));
        if (ts.peek().lexeme === ")") continue;
        ts.nextMustBe(",");
    }
    return xs;
}

function parseParameterList(ts: TokenStream) {
    return parseVariableList(ts, false, false);
}

function parseStructMemberList(ts: TokenStream) {
    return parseVariableList(ts, false, true);
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
            return A.Compiler.NotInferred;
        }
    }
}

function parseFunction(ts: TokenStream, isForeign: boolean): A.FunctionDef {
    const loc = ts.loc();
    ts.nextMustBe("fn");
    const id = ts.nextIsType() ? parseTypeDeclID(ts) : parseIDExpr(ts).id;
    let typeParams = parseTypeDeclParameters(ts);
    ts.nextMustBe("(");
    const params = parseParameterList(ts);
    ts.nextMustBe(")");
    let returns = parseVarType(ts, false);

    return A.newFunctionDef(id, loc, typeParams, returns, params, isForeign ? undefined : parseBlockExpr(ts));
}

function parseStruct(ts: TokenStream): A.StructType {
    const loc = ts.loc();
    ts.nextMustBe("struct");
    let id = parseTypeDeclID(ts);
    let typeParams = parseTypeDeclParameters(ts);
    ts.nextMustBe("(");
    const params = parseStructMemberList(ts);
    ts.nextMustBe(")");

    return A.newStructType(id, loc, typeParams.map(x => A.newTypeParam(x, loc)), params);
}

function parseImport(ts: TokenStream): A.Import {
    const loc = ts.loc();
    ts.nextMustBe("import");
    const id = parseMultiIDExpr(ts);

    return {
        id: id.id + (id.rest.length ? `.${id.rest.join(".")}` : ""),
        loc: loc,
    }
}

function parseLiteralExprList(ts: TokenStream, block: A.BlockExpr) {
    const xs = new Array<any>();
    while (!ts.nextIs(")")) {
        if (!ts.nextIsLiteral()) Errors.Parser.raiseExpectedButFound("Literal", ts.peek());
        xs.push(parseExpr(ts, block));
        if (!ts.consumeIfNextIs(",")) break;
    }
    ts.nextMustBe(")");
    return xs;
}

function parseTypeAlias(ts: TokenStream): A.TypeAlias {
    const loc = ts.loc();
    ts.nextMustBe("type");
    const id = parseTypeDeclID(ts);
    ts.nextMustBe("=");
    const alias = parseType(ts);
    return {
        loc: loc,
        id: id,
        alias: alias,
        mangledName: A.mangleTypeName(id, []),
    };
}

export function parseModule(id: string, ts: TokenStream, path: string): A.Module {
    const loc = ts.loc();
    const functions = new Array<A.FunctionDef>();
    const imports = new Array<A.Import>();
    const types = new Array<A.TypeDef>();
    while (!ts.eof()) {
        if (ts.nextIs("struct")) {
            types.push(parseStruct(ts));
        }
        else if (ts.consumeIfNextIs("foreign")) {
            functions.push(parseFunction(ts, true));
        }
        else if (ts.nextIs("fn")) {
            functions.push(parseFunction(ts, false));
        }
        else if (ts.nextIs("import")) {
            imports.push(parseImport(ts));
        }
        else if (ts.nextIs("type")) {
            types.push(parseTypeAlias(ts));
        }
        else {
            Errors.Parser.raiseExpectedButFound("one of: struct|foreign|fn|type|import", ts.peek());
        }
    }

    return {
        loc: loc,
        id: id,
        path: path,
        types: types,
        functions: functions,
        imports: imports,
    };
}

export function parse(id: string, f: SourceFile) {
    Logger.info(`Parsing: ${f.path}`);
    const cs = CharacterStream.build(f.contents, f.fsPath);
    const ts = lex(cs);
    return parseModule(id, ts, f.path);
}

function _parseNative(x: string, name: string) {
    const cs = CharacterStream.build(x, name);
    const ts = lex(cs);
    return parseModule(name, ts, name);
}

export function parseNative() {
    const native = _parseNative("", A.NativeModule);
    return [native];
}