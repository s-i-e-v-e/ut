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
    clone,
} from "../util/mod.ts";

const NodeType = A.NodeType;
const KnownTypes = P.KnownTypes;
const NativeTypes = P.NativeTypes;
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

function parseType(ts: TokenStream) {
    const loc = ts.loc();
    const id = ts.nextMustBe(TokenType.TK_TYPE).lexeme;
    return P.newType(id, loc);
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
        xs.push(parseTypeAnnotation(ts));
        if (!ts.consumeIfNextIs(",")) break;
    }
    return xs;
}

function parseTypeAnnotation(ts: TokenStream): P.Type {
    const idx = ts.getIndex();
    const loc = ts.loc();

    const getGenericType = (id: string): P.GenericType|undefined => {
        if (!ts.consumeIfNextIs("[")) return undefined;
        const x = clone(P.NativeTypes.Array) as P.GenericType;
        x.id = id;
        x.typeParameters = parseTypeParameters(ts);
        ts.nextMustBe("]");
        return x;
    };

    const x = getGenericType("Array");
    if (x) {
        const tx = ts.getAsToken(idx, ts.getIndex());
        if (x.typeParameters.length != 1) {
            Errors.raiseArrayType(tx);
        }
        return x;
    }
    else {
        const t = ts.peek();
        const isType = t.loc.path === P.NativeModule &&  ["int", "uint", "float"].filter(x => x === t.lexeme).length;
        const id = isType ? ts.next().lexeme : ts.nextMustBe(TokenType.TK_TYPE).lexeme;
        return getGenericType(id) || {
            id: id,
            loc: loc,
        };
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
        xs.push(parseExpr(ts, block));
        if (!ts.consumeIfNextIs(",")) break;
    }
    return xs;
}

function parseTypeInstantiation(ts: TokenStream, block: A.BlockExpr): A.ArrayConstructor {
    const loc = ts.loc();
    const ty = parseTypeAnnotation(ts);
    if (ty.id === "Array") {
        // is array constructor
        const t = ts.peek();
        ts.nextMustBe("(");
        let sizeExpr = undefined;
        let args = undefined;
        if (ts.consumeIfNextIs("#")) {
            sizeExpr = parseExpr(ts, block);
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
        type: KnownTypes.NotInferred,
        isStmt: false,
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
    return {
        nodeType: NodeType.CastExpr,
        expr: e,
        loc: e.loc,
        type: parseTypeAnnotation(ts),
    };
}

function parseReferenceExpr(ts: TokenStream, block: A.BlockExpr): A.ReferenceExpr {
    const loc = ts.loc();
    ts.nextMustBe("&");
    return {
        nodeType: NodeType.ReferenceExpr,
        expr: parseExpr(ts, block),
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

function parseGroupExpr(ts: TokenStream, block: A.BlockExpr): A.GroupExpr {
    const loc = ts.loc();
    ts.nextMustBe("(");
    const e = parseExpr(ts, block);
    ts.nextMustBe(")");
    return {
        nodeType: NodeType.GroupExpr,
        expr: e,
        loc: loc,
        type: KnownTypes.NotInferred,
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
    "!": 70,
    "=": 70,
    "&": 60,
    "|": 60,
};

function parseExpr(ts: TokenStream, block: A.BlockExpr, le?: Expr, rbp?: number): Expr {
    const expr = (rbp: number, left?: Expr): Expr => {
        let op = ts.peek().lexeme;
        left = left || nud(op);
        while (true) {
            op = ts.peek().lexeme;
            let lbp = OperatorPrecedence[op];
            if (rbp < lbp) {
                left = led(op, left);
            }
            else {
                break;
            }
        }
        return left;
    }

    // left-bound expr
    const led = (op: string, le: Expr) => {
        const lbp = OperatorPrecedence[op];
        if (lbp !== undefined) {
            ts.next();
            switch (op) {
                case ":": return parseCastExpr(ts, le);
                case "*":
                case "/":
                case "%":
                case "+":
                case "-":
                case "&":
                case "|":
                case "=":
                case "!": {
                    op = ts.consumeIfNextIs("=") ? op+"=" : op;
                    break;
                }
                default:
            }
            return A.buildBinaryExpr(le, op, expr(lbp));
        }
        else {
            return le;
        }
    };

    // prefix expr
    const nud = (op: string) => {
        switch (op) {
            case "&": {
                return parseReferenceExpr(ts, block);
            }
            case "*": {
                return parseDereferenceExpr(ts);
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
                else if (ts.nextIsType()) {
                    return parseTypeInstantiation(ts, block);
                }
                else {
                    const ide = parseMultiIDExpr(ts);
                    if (ts.nextIs("(")) {
                        return parseFunctionApplication(ts, block, ide);
                    }
                    else {
                        return ide;
                    }
                }
            }
        }
    };
    rbp = rbp || 0;
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

function rewriteBinaryExprIntoAssignment(e: A.BinaryExpr) {
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
        default: Errors.raiseDebug(e.nodeType);
    }
    re = re === undefined ? e : re;

    return A.buildVarAssnStmt(le, re);
}

function parseVarAssignment(ts: TokenStream, block: A.BlockExpr, le: Expr): A.VarAssnStmt {
    if (ts.consumeIfNextIs("=")) {
        return A.buildVarAssnStmt(le, parseExpr(ts, block));
    }
    else {
        const e = parseExpr(ts, block, le) as A.BinaryExpr;
        if (!e.op) Errors.raiseParserError("assignment stmt", e);
        if (le !== e.left) Errors.raiseDebug();
        return rewriteBinaryExprIntoAssignment(e);
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

function parseReturnStmt(ts: TokenStream, block: A.BlockExpr, loc: Location): A.ReturnStmt {
    return {
        nodeType: NodeType.ReturnStmt,
        expr: ts.nextIs(";") ? A.buildVoidExpr(loc) : parseExpr(ts, block),
        loc: loc,
    };
}

function parseAssnOrExprStmt(ts: TokenStream, block: A.BlockExpr) {
    const loc = ts.loc();
    const e = parseExpr(ts, block);
    if (ts.nextIs(";")) {
        const c = e as A.BinaryExpr;
        if (c.op) {
            return rewriteBinaryExprIntoAssignment(c);
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

function parseVarDef(ts: TokenStream, isMutable: boolean, isPrivate: boolean, force: boolean): P.Variable {
    const loc = ts.loc();
    const id = parseIDExpr(ts).id;
    const type = parseVarType(ts, force);
    const isVararg = ts.consumeIfNextIs("*") !== undefined;
    return P.buildVar(
        id,
        type,
        isMutable,
        isVararg,
        isPrivate,
        loc,
    );
}

function parseVariableList(ts: TokenStream, isMutable: boolean, canBePrivate: boolean) {
    const xs = new Array<P.Parameter>();
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
        return parseTypeAnnotation(ts);
    }
    else {
        if (ts.consumeIfNextIs(":")) {
            return parseTypeAnnotation(ts);
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
    const typeParameters = ts.consumeIfNextIs("[") ? parseTypeParameters(ts) : [];
    if (typeParameters.length) ts.nextMustBe("]");
    ts.nextMustBe("(");
    const xs = parseParameterList(ts);
    ts.nextMustBe(")");
    let type = parseVarType(ts, false);

    return {
        id: id,
        params: xs,
        type: type,
        typeParameters: typeParameters,
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
    let ty = parseTypeAnnotation(ts) as P.GenericType;
    ts.nextMustBe("(");
    const members = parseStructMemberList(ts);
    ts.nextMustBe(")");
    return {
        type: {
            id: ty.id,
            loc: ty.loc,
        },
        typeParameters: ty.typeParameters || [],
        members: members,
        loc: loc,
    }
}

function parseImport(ts: TokenStream): P.Import {
    const loc = ts.loc();
    ts.nextMustBe("import");
    const id = parseMultiIDExpr(ts);

    return {
        id: id.id + (id.rest ? `.${id.rest}` : ""),
        loc: loc,
    }
}

function parseLiteralExprList(ts: TokenStream, block: A.BlockExpr) {
    const xs = new Array<any>();
    while (!ts.nextIs(")")) {
        if (!ts.nextIsLiteral()) Errors.raiseExpectedButFound("Literal", ts.peek());
        xs.push(parseExpr(ts, block));
        if (!ts.consumeIfNextIs(",")) break;
    }
    ts.nextMustBe(")");
    return xs;
}

function parseTypeDeclaration(ts: TokenStream, type: Type, cons: Type) {
    const loc = ts.loc();
    const block = buildBlockExpr(loc);
    const xs = parseLiteralExprList(ts, block);
    return {
        loc: loc,
        type: type,
        cons: cons,
        params: xs,
    } as P.TypeDeclaration;
}

function parseTypeDefinition(ts: TokenStream): P.TypeDefinition {
    const loc = ts.loc();
    ts.nextMustBe("type");
    const ltype = parseType(ts);
    ts.nextMustBe("=");
    const rtype = parseType(ts);
    if (ts.consumeIfNextIs("(")) {
        // is type constructor
        return parseTypeDeclaration(ts, ltype, rtype);
    }
    else {
        // is type alias
        return {
            loc: loc,
            type: ltype,
            alias: rtype,
        } as P.TypeAlias;
    }
}

export function parseModule(id: string, ts: TokenStream, path: string) {
    const xs = new Array<P.Struct>();
    const ys = new Array<P.ForeignFunction>();
    const zs = new Array<P.Function>();
    const is = new Array<P.Import>();
    const types = new Array<P.TypeDefinition>();
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
        else if (ts.nextIs("import")) {
            is.push(parseImport(ts));
        }
        else if (ts.nextIs("type")) {
            types.push(parseTypeDefinition(ts));
        }
        else {
            Errors.raiseDebug(ts.peek().lexeme);
        }
    }

    return {
        id: id,
        path: path,
        types: types,
        structs: xs,
        foreignFunctions: ys,
        functions: zs,
        imports: is,
    };
}

export function parse(id: string, f: SourceFile) {
    Logger.info(`Parsing: ${f.path}`);
    const cs = CharacterStream.build(f.contents, f.fsPath);
    const ts = lex(cs);
    return parseModule(id, ts, f.path);
}

export function parseNative() {
    const cs = CharacterStream.build(native, P.NativeModule);
    const ts = lex(cs);
    return parseModule(P.NativeModule, ts, P.NativeModule);
}

const native =
`
struct UnsignedInt(#bits: Word)
struct SignedInt(#bits: Word)
struct Float(#bits: Word, #exp-bits: Word)
struct Array[A](#a: A*)

type Integer = Word
type Bool = UnsignedInt(8)
type Bits8 = UnsignedInt(8)
type Uint8 = UnsignedInt(8)
type Int8 = SignedInt(8)
type Bits16 = UnsignedInt(16)
type Uint16 = UnsignedInt(16)
type Int16 = SignedInt(16)
type Bits32 = UnsignedInt(32)
type Uint32 = UnsignedInt(32)
type Int32 = SignedInt(32)
type Bits64 = UnsignedInt(64)
type Uint64 = UnsignedInt(64)
type Int64 = SignedInt(64)
type Bits128 = UnsignedInt(128)
type Uint128 = UnsignedInt(128)
type Int128 = SignedInt(128)
type Float8 = Float(8, 2)
type Float16 = Float(16, 5)
type Float32 = Float(32, 8)
type Float64 = Float(64, 11)
type Float80 = Float(80, 15)
type Float128 = Float(128, 15)
type Pointer = UnsignedInt(64)
type String = Pointer
type Void = UnsignedInt(64)
`;