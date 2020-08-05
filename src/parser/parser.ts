/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Location,
    CharacterStream,
    TokenStream,
    lex,
    Block,
    TokenType,
    ModuleDef,
    TypeParamRef,
    TypeSpecRef,
    /*TypeRef,*/
    IDRef,
    IDExpr,
    Expr,
    RefExpr,
    BinaryExpr,
    VarSpecRef,
    Literal,
} from "./mod.ts";
import {
    Errors,
    Logger,
    SourceFile,
    Dictionary,
} from "../driver/mod.ts";
import {BlockExpr, DerefExpr} from "./data.ts";

/** ID FUNCTIONS **/
function parseID(block: Block, ts: TokenStream) {
    return block.addID(ts.nextMustBe(TokenType.TK_ID, "ID").lexeme);
}

function parseIDExpr(block: Block, ts: TokenStream) {
    const loc = ts.loc();
    const id = parseID(block, ts);
    return block.addIDExpr(loc, id, []);
}

function parseMultiID(block: Block, ts: TokenStream): [IDRef, IDRef[]] {
    if (ts.nextIsID()) return [parseID(block, ts), []];
    const t = ts.nextMustBe(TokenType.TK_MULTI_ID, "ID");
    return [block.addID(t.lexeme), t.xs.map(x => block.addID(x))];
}

function parseMultiIDExpr(block: Block, ts: TokenStream) {
    const loc = ts.loc();
    const [id, rest] = parseMultiID(block, ts);
    return block.addIDExpr(loc, id, rest);
}

/** TYPE FUNCTIONS **/
function parseTypeID(block: Block, ts: TokenStream, isDef: boolean = false) {
    const t = ts.nextMustBe(TokenType.TK_TYPE, "TYPE");
    if (isDef && t.lexeme.length <= 1) Errors.Parser.parserError("Single character type names are reserved for type params", t);
    return block.addID(t.lexeme);
}

function parseTypeDeclID(block: Block, ts: TokenStream) {
    return parseTypeID(block, ts, true);
}

function parseTypeParamID(block: Block, ts: TokenStream) {
    const t = ts.nextMustBe(TokenType.TK_TYPE, "TYPE");
    if (t.lexeme.length !== 1) Errors.Parser.parserError("Type parameters must be single characters", t);
    return block.addTypeParam(t.loc, block.addID(t.lexeme));
}

function parseTypeIDExpr(block: Block, ts: TokenStream) {
    const loc = ts.loc();
    const id = parseTypeID(block, ts);
    return block.addTypeIDExpr(loc, id);
}

// struct Array[A]
// struct Map[A, B]
function parseTypeDeclParameters(block: Block, ts: TokenStream) {
    if (!ts.consumeIfNextIs("[")) return [];

    const xs = new Array<TypeParamRef>();
    while (!ts.nextIs("]")) {
        xs.push(parseTypeParamID(block, ts));
        if (!ts.consumeIfNextIs(",")) break;
    }
    ts.nextMustBe("]");
    return xs;
}

function parseTypeSpecifier(block: Block, ts: TokenStream) {
    const parseTypeSpecRef = (e?: IDExpr): TypeSpecRef => {
        const parseTypeSpecParameters = (): TypeSpecRef[] => {
            if (!ts.consumeIfNextIs("[")) return [];
            const xs = new Array<TypeSpecRef>();
            while (!ts.nextIs("]")) {
                xs.push(parseTypeSpecRef());
                if (!ts.consumeIfNextIs(",")) break;
            }
            ts.nextMustBe("]");
            return xs;
        };

        const loc = ts.loc();
        const typeID = e ? e.id : (ts.nextIs("[") ? block.addID("Array") : parseTypeID(block, ts));
        return block.addTypeSpec(loc, typeID, parseTypeSpecParameters());
    };
    return parseTypeSpecRef();
}

function parseTypeSpecifierSuffix(block: Block, ts: TokenStream, isOptional: boolean) {
    if (isOptional) {
        if (ts.consumeIfNextIs(":")) {
            return parseTypeSpecifier(block, ts);
        } else {
            return Block.CompilerTypes.NotInferred;
        }
    } else {
        ts.nextMustBe(":");
        return parseTypeSpecifier(block, ts);
    }
}

/** LITERALS **/
function parseNumber(n: string, radix: number) {
    const NumGrid: Dictionary<number> = {
        "0": 0,
        "1": 1,
        "2": 2,
        "3": 3,
        "4": 4,
        "5": 5,
        "6": 6,
        "7": 7,
        "8": 8,
        "9": 9,
        "A": 10,
        "B": 11,
        "C": 12,
        "D": 13,
        "E": 14,
        "F": 15,
        "a": 10,
        "b": 11,
        "c": 12,
        "d": 13,
        "e": 14,
        "f": 15,
    }

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
    return sum;
}

function parseLiteral(block: Block, ts: TokenStream) {
    const loc = ts.loc();
    const t = ts.next();
    switch (t.type) {
        case TokenType.TK_STRING_LITERAL:
            return block.addStringLiteral(loc, t.lexeme.substring(1, t.lexeme.length - 1));
        case TokenType.TK_BOOLEAN_LITERAL:
            return block.addBoolLiteral(loc, t.lexeme === "true");
        case TokenType.TK_BINARY_NUMBER_LITERAL:
            return block.addIntegerLiteral(loc, parseNumber(t.lexeme, 2));
        case TokenType.TK_OCTAL_NUMBER_LITERAL:
            return block.addIntegerLiteral(loc, parseNumber(t.lexeme, 8));
        case TokenType.TK_HEXADECIMAL_NUMBER_LITERAL:
            return block.addIntegerLiteral(loc, parseNumber(t.lexeme, 16));
        case TokenType.TK_DECIMAL_NUMBER_LITERAL:
            return block.addIntegerLiteral(loc, parseNumber(t.lexeme, 10));
        default:
            return Errors.Parser.raiseExpectedButFound("Integer/String/Bool literal", t);
    }
}

function parseExprList(block: Block, ts: TokenStream): Expr[] {
    const xs = new Array<Expr>();
    while (!ts.nextIs(")")) {
        xs.push(parseExpr(block, ts));
        if (!ts.consumeIfNextIs(",")) break;
    }
    return xs;
}

function parseIfExpr(block: Block, ts: TokenStream) {
    const loc = ts.loc();
    ts.nextMustBe("if");
    ts.nextMustBe("(");
    const cond = parseExpr(block, ts);
    ts.nextMustBe(")");
    const ifBranch = parseBlockExpr(block, ts);
    ts.nextMustBe("else");
    const elseBranch = parseBlockExpr(block, ts);
    return block.addIfExpr(loc, cond, ifBranch, elseBranch);
}

function parseFunctionApplication(block: Block, ts: TokenStream, e: IDExpr) {
    const id = e || parseMultiIDExpr(block, ts);
    const typeParams = parseTypeDeclParameters(block, ts);
    ts.nextMustBe("(");
    const xs = parseExprList(block, ts);
    ts.nextMustBe(")");
    return block.addApplication(id, typeParams, xs);
}

function parseCastExpr(block: Block, ts: TokenStream, e: Expr) {
    return block.addCastExpr(e, parseTypeSpecifier(block, ts));
}

function parseRefExpr(block: Block, ts: TokenStream): RefExpr {
    const loc = ts.loc();
    ts.nextMustBe("&");
    return block.addRefExpr(loc, parseExpr(block, ts));
}

function parseDereferenceExpr(block: Block, ts: TokenStream): DerefExpr {
    const loc = ts.loc();
    ts.nextMustBe("*");
    const e = ts.nextIs("*") ? parseDereferenceExpr(block, ts) : parseMultiIDExpr(block, ts);
    return block.addDerefExpr(loc, e);
}

function parseGroupExpr(block: Block, ts: TokenStream) {
    const loc = ts.loc();
    ts.nextMustBe("(");
    const e = parseExpr(block, ts);
    ts.nextMustBe(")");
    return block.addGroupExpr(loc, e);
}

function parseExpr(block: Block, ts: TokenStream, le?: Expr, rbp: number = 0): Expr {
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

    const operator = (rbp: number): [string, number] => {
        const o1 = ts.peek().lexeme;
        const o2 = o1 ? o1 + ts.peek(1).lexeme : o1;
        if (rbp < OperatorPrecedence[o2]) {
            ts.next();
            ts.next();
            return [o2, OperatorPrecedence[o2] || 0]
        } else if (rbp < OperatorPrecedence[o1]) {
            ts.next();
            return [o1, OperatorPrecedence[o1] || 0]
        } else {
            return ["", 0];
        }
    };

    const expr = (rbp: number, left?: Expr): Expr => {
        left = left || nud(ts.peek().lexeme);
        while (true) {
            let [op, lbp] = operator(rbp);
            if (lbp) {
                left = led(op, lbp, left);
            } else {
                break;
            }
        }
        return left;
    }

    // left-bound expr
    const led = (op: string, lbp: number, le: Expr): Expr => {
        switch (op) {
            case ":":
                return parseCastExpr(block, ts, le);
            case ";":
                return le;
            default: {
                return block.addBinaryExpr(le, op, expr(lbp));
            }
        }
    };

    // prefix expr
    const nud = (op: string): Expr => {
        switch (op) {
            case "&": {
                return parseRefExpr(block, ts);
            }
            case "*": {
                return parseDereferenceExpr(block, ts);
            }
            case "(": {
                return parseGroupExpr(block, ts);
            }
            case "{": {
                return parseBlockExpr(block, ts);
            }
            case "if": {
                return parseIfExpr(block, ts);
            }
            default: {
                if (ts.nextIsLiteral()) {
                    return parseLiteral(block, ts);
                } else {
                    const e = ts.nextIsType() ? parseTypeIDExpr(block, ts) : parseMultiIDExpr(block, ts);
                    if (ts.nextIs("(") || ts.nextIs("[")) {
                        return parseFunctionApplication(block, ts, e);
                    } else {
                        return e;
                    }
                }
            }
        }
    };
    return expr(rbp, le);
}

function parseVarInit(block: Block, ts: TokenStream, isMutable: boolean) {
    const loc = ts.loc();
    ts.nextMustBe(isMutable ? "var" : "let");
    const v = parseVarSpec(block, ts, isMutable, false, true);
    ts.nextMustBe("=");
    const e = parseExpr(block, ts);
    return block.addVarInitExpr(loc, v, e);
}

function parseAssnOrExprStmt(block: Block, ts: TokenStream) {
    const e = parseExpr(block, ts) as BinaryExpr;
    if (e.op === undefined) return e;
    if (e.op === ";") return e.left;
    return parseVarAssn(block, ts, e);
}

function parseVarAssn(block: Block, ts: TokenStream, x?: Expr) {
    const e = (x || parseExpr(block, ts)) as BinaryExpr;
    switch (e.op) {
        case "*=":
        case "/=":
        case "%=":
        case "+=":
        case "-=":
        case "&=":
        case "|=": {
            e.op = e.op.charAt(0);
            return block.addVarAssnExpr(e.left, e);
        }
        case "=": {
            return block.addVarAssnExpr(e.left, e.right);
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

function parseForStmt(block: Block, ts: TokenStream) {
    const loc = ts.loc();
    block = block.newBlock(loc);
    ts.nextMustBe("for");
    ts.nextMustBe("(");
    const init = ts.consumeIfNextIs(";") ? undefined : parseVarInit(block, ts, true);
    if (init) ts.nextMustBe(";");
    const cond = ts.consumeIfNextIs(";") ? undefined : parseExpr(block, ts);
    if (cond) ts.nextMustBe(";");
    const update = ts.nextIs(")") ? undefined : parseVarAssn(block, ts);
    ts.nextMustBe(")");
    block = block.newForExpr(loc, init, cond, update);
    parseBlockExpr(block, ts);
}

function parseReturnStmt(block: Block, ts: TokenStream, loc: Location) {
    const e = ts.nextIs(";") ? block.addVoidExpr(loc) : parseExpr(block, ts);
    return block.addReturnExpr(loc, e);
}

function parseBlockExpr(block: Block, ts: TokenStream) {
    const loc = ts.loc();
    ts.nextMustBe("{");
    block = block.newBlock(loc);
    while (!ts.nextIs("}")) {
        if (ts.nextIs("let")) {
            block.body.push(parseVarInit(block, ts, false));
        } else if (ts.nextIs("var")) {
            block.body.push(parseVarInit(block, ts, true));
        } else if (ts.consumeIfNextIs("return")) {
            block.body.push(parseReturnStmt(block, ts, loc));
        } else if (ts.nextIs("for")) {
            parseForStmt(block, ts);
        } else {
            block.body.push(parseAssnOrExprStmt(block, ts));
        }
        ts.nextMustBe(";");
    }
    ts.nextMustBe("}");
    return block as BlockExpr;
}

function parseVarSpec(block: Block, ts: TokenStream, isMutable: boolean, isPrivate: boolean, isOptional: boolean) {
    const loc = ts.loc();
    const id = parseID(block, ts);
    const type = parseTypeSpecifierSuffix(block, ts, isOptional);
    const isVararg = ts.consumeIfNextIs("*") !== undefined;
    return block.addVarSpec(loc, id, type, isMutable, isVararg, isPrivate)
}

function parseVarSpecList(block: Block, ts: TokenStream, isMutable: boolean, canBePrivate: boolean) {
    const xs = new Array<VarSpecRef>();
    while (ts.peek().lexeme !== ")") {
        const isPrivate = canBePrivate && ts.consumeIfNextIs("#") !== undefined;
        xs.push(parseVarSpec(block, ts, isMutable, isPrivate, false));
        if (ts.peek().lexeme === ")") continue;
        ts.nextMustBe(",");
    }
    return xs;
}

function parseFunction(block: Block, ts: TokenStream, isForeign: boolean) {
    const loc = ts.loc();
    if (isForeign) ts.nextMustBe("foreign");
    ts.nextMustBe("fn");
    const ref = ts.nextIsType() ? parseTypeDeclID(block, ts) : parseID(block, ts);
    block = block.newFunction(loc, ref);

    parseTypeDeclParameters(block, ts);
    ts.nextMustBe("(");
    parseVarSpecList(block, ts, false, false);
    ts.nextMustBe(")");
    parseTypeSpecifierSuffix(block, ts, true);
    parseBlockExpr(block, ts);
}

function parseType(block: Block, ts: TokenStream) {
    const loc = ts.loc();
    ts.nextMustBe("type");
    const id = parseTypeID(block, ts);
    const typeParams = parseTypeDeclParameters(block, ts);
    ts.nextMustBe("=");
    const type = parseTypeSpecifier(block, ts);
    if (ts.consumeIfNextIs("(")) {
        const parseLiteralExprList = () => {
            const xs = new Array<Literal<any>>();
            while (!ts.nextIs(")")) {
                if (!ts.nextIsLiteral()) Errors.Parser.raiseExpectedButFound("Literal", ts.peek());
                const e = parseExpr(block, ts) as Literal<any>;
                xs.push(e);
                if (!ts.consumeIfNextIs(",")) break;
            }
            return xs;
        }
        const args = parseLiteralExprList();
        ts.nextMustBe(")");
        return block.addTypeConsDef(loc, id, typeParams, type, args);
    }
    else {
        return block.addTypeAliasDef(loc, id, typeParams, type);
    }
}

function parseStruct(block: Block, ts: TokenStream) {
    const loc = ts.loc();
    ts.nextMustBe("struct");
    const ref = parseTypeDeclID(block, ts);
    block = block.newStruct(loc, ref);

    parseTypeDeclParameters(block, ts);
    ts.nextMustBe("(");
    parseVarSpecList(block, ts, false, true);
    ts.nextMustBe(")");
}

function parseImport(block: Block, ts: TokenStream) {
    const loc = ts.loc();
    ts.nextMustBe("import");
    const [id, rest] = parseMultiID(block, ts);
    return block.addImportExpr(loc, id, rest);
}

function parseModule(block: Block, ts: TokenStream, id: string, path: string) {
    Errors.debug();
    const loc = ts.loc();
    const ref = block.addID(id)
    block = block.newModule(loc, ref, path);
    while (!ts.eof()) {
        if (ts.nextIs("import")) {
            parseImport(block, ts);
        } else if (ts.nextIs("struct")) {
            parseStruct(block, ts);
        } else if (ts.nextIs("type")) {
            parseType(block, ts);
        } else if (ts.nextIs("foreign")) {
            parseFunction(block, ts, true);
        } else if (ts.nextIs("fn")) {
            parseFunction(block, ts, false);
        } else {
            Errors.Parser.raiseExpectedButFound("one of: struct|foreign|fn|type|import", ts.peek());
        }
    }
    return block as ModuleDef;
}

export function parse(global: Block, id: string, f: SourceFile) {
    Logger.info(`Parsing: ${f.path}`);
    const cs = CharacterStream.build(f.contents, f.fsPath);
    const ts = lex(cs);
    return parseModule(global, ts, id, f.path);
}