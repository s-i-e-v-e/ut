/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {Dictionary, int, Logger, object_values} from "../util/mod.ts";
import SymbolTable from "../semantics/SymbolTable.ts";

export interface Location {
    line: number;
    character: number;
    index: number;
    path: string;
}

export interface Primitive {
    loc: Location;
    id: string;
}

export interface Type extends Primitive {
    typeParams: Type[];
    takes: Type[],
    returns: Type|undefined,
    mangledName: string;
}

export interface Module extends Primitive {
    path: string,
    types: TypeAlias[],
    structs: StructDef[],
    functions: FunctionDef[],
    imports: Import[],
    st?: SymbolTable;
}

export interface Import extends Primitive {}

export interface StructDef extends Type {
    params: Variable[];
}

export interface FunctionDef extends Type {
    params: Variable[];
    body?: BlockExpr;
    st?: SymbolTable;
}

export interface TypeAlias extends Primitive {
    type: Type;
}

export interface Variable extends Primitive {
    type: Type;
    isMutable: boolean;
    isPrivate: boolean;
    isVararg: boolean;
}

export enum NodeType {
    ExprStmt,
    VarInitStmt,
    VarAssnStmt,
    ForStmt,
    ReturnStmt,

    StmtExpr,
    VoidExpr,
    CastExpr,
    GroupExpr,
    BlockExpr,
    StringLiteral,
    BooleanLiteral,
    NumberLiteral,
    IDExpr,
    TypeInstance,
    FunctionApplication,
    IfExpr,
    LocalReturnExpr,
    ArrayExpr,
    BinaryExpr,
    ReferenceExpr,
    DereferenceExpr,
    NegationExpr,
    NotExpr,
}

export function node_str(n: NodeType) {
    return NodeType[n];
}

export function node_print(n: NodeType) {
    Logger.debug(node_str(n));
}

export interface AstNode {
    nodeType: NodeType,
    loc: Location,
}
export interface Stmt extends AstNode {}

export interface ExprStmt extends Stmt {
    expr: Expr;
}

export interface VarInitStmt extends Stmt {
    var: Variable;
    expr: Expr;
}

export interface VarAssnStmt extends Stmt {
    lhs: Expr;
    rhs: Expr;
}

export interface ReturnStmt extends Stmt {
    expr: Expr;
}

export interface StmtExpr extends Expr {
    stmt: Stmt;
}

export interface ForStmt extends Stmt {
    init?: VarInitStmt;
    condition?: Expr;
    update?: VarAssnStmt;
    body: BlockExpr;
    st?: SymbolTable;
}

export interface Expr extends AstNode {
    type: Type,
}

export interface IDExpr extends Expr {
    id: string;
    rest: string[];
}

export interface BlockExpr extends Expr {
    parent?: BlockExpr;
    xs: Stmt[];
    st?: SymbolTable;
}

export interface ArrayExpr extends Expr {
    expr: IDExpr;
    args: Expr[];
}

export interface DereferenceExpr extends Expr {
    expr: Expr|DereferenceExpr;
}

export interface GroupExpr extends Expr {
    expr: Expr;
}

export interface BinaryExpr extends Expr {
    left: Expr;
    op: string,
    right: Expr;
}

export interface CastExpr extends Expr {
    expr: Expr;
    type: Type,
}

export interface ReferenceExpr extends Expr {
    expr: Expr;
}

export interface NegationExpr extends Expr {
    expr: Expr;
}

export interface NotExpr extends Expr {
    expr: Expr;
}

/**
 * note: As function application can return an lvalue, it can
 * be treated as an lvalue. But this can only be decided after
 * type-checking. To avoid needless complexity, we treat it as
 * an rvalue for now.
 *
 * There is a simple workaround for:
 * { foo()(0) = 7; } ----> { let x = foo(); x(0) = 7; }
 *
 */
export interface FunctionApplication extends Expr {
    expr: IDExpr;
    typeParams: Type[];
    args: Expr[];
    mangledName?: string;
    oldStruct?: StructDef;
}

export interface IfExpr extends Expr {
    condition: Expr;
    ifBranch: BlockExpr;
    elseBranch: BlockExpr;
    isStmt: boolean;
}

export interface LocalReturnExpr extends Expr {
    expr: Expr;
}

export interface Literal<T> extends Expr {
    value: T;
}

export interface StringLiteral extends Literal<string> {}
export interface BooleanLiteral extends Literal<boolean> {}
export interface NumberLiteral extends Literal<int> {}

export function buildExprStmt(re: Expr, loc?: Location): ExprStmt {
    return {
        nodeType: NodeType.ExprStmt,
        expr: re,
        loc: loc || re.loc,
    };
}

export function buildVarAssnStmt(le: Expr, re: Expr): VarAssnStmt {
    return {
        nodeType: NodeType.VarAssnStmt,
        lhs: le,
        rhs: re,
        loc: le.loc,
    };
}

export function buildBinaryExpr(left: Expr, op: string, right: Expr): BinaryExpr {
    return {
        nodeType: NodeType.BinaryExpr,
        left: left,
        op: op,
        right: right,
        loc: left.loc,
        type: Compiler.NotInferred,
    };
}

export function buildVoidExpr(loc: Location) {
    return {
        nodeType: NodeType.VoidExpr,
        type: Language.void,
        loc: loc,
    };
}

export function buildBlockExpr(loc: Location, parent?: BlockExpr): BlockExpr  {
    return {
        nodeType: NodeType.BlockExpr,
        type: Compiler.NotInferred,
        loc: loc,
        xs: new Array<any>(),
        parent: parent,
    };
}

export const NativeModule = "<native>";

export const NativeLoc = {
    index: 0,
    line: 1,
    character: 1,
    path: NativeModule,
};

export const UnknownLoc = {
    index: 0,
    line: 1,
    character: 1,
    path: "<unknown>",
};

export const Compiler = {
    Array: newType("Array"),
    NotInferred: newType("NotInferred"),
};

export const Language = {
    void: newType("void", NativeLoc),
    ptr: newType("ptr", NativeLoc),
    b8: newType("b8", NativeLoc),
    b16: newType("b16", NativeLoc),
    b32: newType("b32", NativeLoc),
    b64: newType("b64", NativeLoc),
    b128: newType("b128", NativeLoc),
    u8: newType("u8", NativeLoc),
    u16: newType("u16", NativeLoc),
    u32: newType("u32", NativeLoc),
    u64: newType("u64", NativeLoc),
    u128: newType("u128", NativeLoc),
    i8: newType("i8", NativeLoc),
    i16: newType("i16", NativeLoc),
    i32: newType("i32", NativeLoc),
    i64: newType("i64", NativeLoc),
    i128: newType("i128", NativeLoc),
    f8: newType("f8", NativeLoc), // 8_2
    f16: newType("f16", NativeLoc), // 16_5
    f32: newType("f32", NativeLoc), // 32_8
    f64: newType("f64", NativeLoc), // 64_11
    f80: newType("f80", NativeLoc), // 80_15
    f128: newType("f128", NativeLoc), // 128_15
    bool: newType("bool"),
    string: newType("String"), // struct String
};

export function newType(id: string, loc?: Location, typeParams?: Type[]): Type {
    typeParams = typeParams || [];
    return {
        loc: loc || UnknownLoc,
        id: id,
        typeParams: typeParams,
        takes: [],
        returns: undefined,
        mangledName: mangleName(id, typeParams, []),
    };
}


export function toTypeString(t: Type, xs?: Array<string>) {
    const g = t;
    xs = xs ? xs : [""];
    xs.push(g.id)
    if (g.typeParams.length) {
        xs.push("[");
        for (let i = 0; i < g.typeParams.length; i += 1) {
            toTypeString(g.typeParams[i], xs);
        }
        xs.push("]");
    }
    return xs.join("");
}

export function mangleName(id: string, typeParams: Type[], takes: Type[], returns?: Type) {
    const mangleTypes = (xs: Type[]): string => {
        const ys = [];
        for (const x of xs) {
            ys.push(`$${x.id}`);
            if (x.typeParams.length) {
                ys.push("[");
                ys.push(mangleTypes(x.typeParams));
                ys.push("]");
            }
        }
        return ys.join("");
    };

    const ys = [];
    ys.push(`${id}`);
    if (typeParams.length) {
        ys.push("[");
        ys.push(mangleTypes(typeParams));
        ys.push("]");
    }
    ys.push("(");
    ys.push(mangleTypes(takes));
    ys.push(")");
    /*if (returns) {
        ys.push(":");
        ys.push(mangleTypes([returns]));
    }*/
    return ys.join("");
}

export const LanguageMap: Dictionary<Type> = Language;
export const IntegerTypes = object_values<Type>(Language).filter(x => x.id.startsWith("i") || x.id.startsWith("u"));
export const FloatTypes = object_values<Type>(Language).filter(x => x.id.startsWith("f"));
export const BitTypes = object_values<Type>(Language).filter(x => x.id.startsWith("b") && x.id !== Language.bool.id);

export function nativeSizeInBits(t: Type) {
    const map: Dictionary<Type> = Language;
    const x = map[t.id];
    if (!x) return 64;
    if (x.id === Language.bool.id) return 8;
    if (x.id === Language.string.id) return 64;
    if (x.id === Language.ptr.id) return 64;
    return Number(x.id.substring(1));
}

export function newFunctionType(id: string, loc: Location, typeParams: Type[], returns: Type, params: Variable[]): FunctionDef {
    const takes = params.map(x => x.type);
    return {
        loc: loc || UnknownLoc,
        id: id,
        typeParams: typeParams,
        takes: takes,
        returns: returns,
        params: params,
        mangledName: mangleName(id, typeParams, takes, returns),
    };
}

export function newStructType(id: string, loc: Location, typeParams: Type[], params: Variable[]): StructDef {
    const takes = params.map(x => x.type);
    return {
        loc: loc || UnknownLoc,
        id: id,
        typeParams: typeParams,
        takes: takes,
        returns: Language.void,
        params: params,
        mangledName: mangleName(id, typeParams, takes),
    };
}

export function buildVar(id: string, type: Type, isMutable: boolean, isVararg: boolean, isPrivate: boolean, loc: Location) {
    return {
        id: id,
        type: type,
        isMutable: isMutable,
        isPrivate: isPrivate,
        isVararg: isVararg,
        loc: loc,
    };
}