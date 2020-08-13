/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {Dictionary, int, Logger, object_values} from "../util/mod.ts";
import {A} from "./mod.ts";

export interface Tag {
    tag?: any;
}

export interface Location {
    line: number;
    character: number;
    index: number;
    path: string;
}

export interface Primitive extends Tag {
    loc: Location;
    id: string;
}

export interface Type extends Primitive {
    mangledName: string;
}

export interface TypeDef extends Type {}
export interface PrimitiveType extends TypeDef {}
export interface FreeTypeParam extends TypeDef {}

export interface TypeAlias extends TypeDef {
    alias: Type;
}

export interface SumType extends TypeDef {
    types: Type[];
}

export interface ProductType extends TypeDef {
    types: Type[];
}

export interface StructType extends TypeDef {
    freeTypeParams: FreeTypeParam[];
    boundTypeParams: TypeParam[];
    params: Variable[],
}

type TypeParam = FreeTypeParam|ParametricType
export interface ParametricType extends Type {
    typeParams: TypeParam[]; // param can be free or bound
}

export interface FunctionType extends Type {
    freeTypeParams: FreeTypeParam[];
    boundTypeParams: TypeParam[];
    takes: Type[];
    returns: Type,
}

export interface Module extends Primitive {
    path: string,
    types: TypeDef[],
    functions: FunctionDef[],
    imports: Import[],
}

export interface Import extends Primitive {}

export interface FunctionDef extends Primitive {
    type: FunctionType,
    params: Variable[],
    body: BlockExpr|undefined;
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

export interface ForStmt extends Stmt, Tag {
    init?: VarInitStmt;
    condition?: Expr;
    update?: VarAssnStmt;
    body: BlockExpr;
}

export interface Expr extends AstNode {
    type: Type,
}

export interface IDExpr extends Expr {
    id: string;
    rest: string[];
}

export interface BlockExpr extends Expr, Tag {
    parent?: BlockExpr;
    xs: Stmt[];
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
    Pointer: newPrimitiveType("Pointer", NativeLoc),
    String: newPrimitiveType("String", NativeLoc),
    Array: newPrimitiveType("Array", NativeLoc),
    NotInferred: newPrimitiveType("NotInferred", NativeLoc),
};

export const Language = {
    void: newPrimitiveType("void", NativeLoc),
    ptr: newPrimitiveType("ptr", NativeLoc),
    b8: newPrimitiveType("b8", NativeLoc),
    b16: newPrimitiveType("b16", NativeLoc),
    b32: newPrimitiveType("b32", NativeLoc),
    b64: newPrimitiveType("b64", NativeLoc),
    b128: newPrimitiveType("b128", NativeLoc),
    u8: newPrimitiveType("u8", NativeLoc),
    u16: newPrimitiveType("u16", NativeLoc),
    u32: newPrimitiveType("u32", NativeLoc),
    u64: newPrimitiveType("u64", NativeLoc),
    u128: newPrimitiveType("u128", NativeLoc),
    i8: newPrimitiveType("i8", NativeLoc),
    i16: newPrimitiveType("i16", NativeLoc),
    i32: newPrimitiveType("i32", NativeLoc),
    i64: newPrimitiveType("i64", NativeLoc),
    i128: newPrimitiveType("i128", NativeLoc),
    f8: newPrimitiveType("f8", NativeLoc), // 8_2
    f16: newPrimitiveType("f16", NativeLoc), // 16_5
    f32: newPrimitiveType("f32", NativeLoc), // 32_8
    f64: newPrimitiveType("f64", NativeLoc), // 64_11
    f80: newPrimitiveType("f80", NativeLoc), // 80_15
    f128: newPrimitiveType("f128", NativeLoc), // 128_15
    bool: newPrimitiveType("bool", NativeLoc),
    string: newPrimitiveType("string", NativeLoc), // struct String
};

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

export function newTypeParam(id: string, loc: Location): FreeTypeParam {
    return {
        loc: loc,
        id: id,
        mangledName: mangleTypeName(id, []),
    };
}

function newPrimitiveType(id: string, loc: Location): PrimitiveType {
    return {
        loc: loc,
        id: id,
        mangledName: mangleTypeName(id, []),
    };
}

export function newParametricType(id: string, loc: Location, typeParams: TypeParam[]): ParametricType {
    return {
        loc: loc,
        id: id,
        typeParams: typeParams,
        mangledName: mangleTypeName(id, typeParams),
    };
}

function newFunctionType(id: string, loc: Location, typeParams: Type[], returns: Type, params: Variable[]): FunctionType {
    const takes = params.map(x => x.type);
    return {
        loc: loc,
        id: id,
        freeTypeParams: typeParams,
        boundTypeParams: [],
        takes: takes,
        returns: returns,
        mangledName: mangleFunctionName(id, typeParams, takes),
    };
}

export function newFunctionDef(id: string, loc: Location, typeParams: string[], returns: Type, params: Variable[], body?: BlockExpr): FunctionDef {
    const x = newFunctionType(id, loc, typeParams.map(x => A.newTypeParam(x, loc)), returns, params);
    return {
        id: id,
        loc: loc,
        type: x,
        params: params,
        body: body,
    };
}

export function newStructType(id: string, loc: Location, typeParams: Type[], params: Variable[]): StructType {
    return {
        loc: loc,
        id: id,
        freeTypeParams: typeParams,
        boundTypeParams: [],
        params: params,
        mangledName: mangleTypeName(id, typeParams),
    };
}

export function getTypeParams(t: Type): TypeParam[] {
    const a = t as ParametricType;
    const b = t as FunctionType;
    return a.typeParams ? a.typeParams : b.freeTypeParams ? (b.freeTypeParams.length ? b.freeTypeParams : b.boundTypeParams) : [];
}

export function toTypeString(t: Type, xs?: Array<string>) {
    const g = t;
    xs = xs ? xs : [""];
    xs.push(g.id)

    const typeParams = getTypeParams(g);
    if (typeParams.length) {
        xs.push("[");
        for (let i = 0; i < typeParams.length; i += 1) {
            toTypeString(typeParams[i], xs);
        }
        xs.push("]");
    }
    return xs.join("");
}

const mangleTypes = (xs: Type[]): string => {
    const ys = [];
    for (const x of xs) {
        ys.push(`$${x.id}`);
        const typeParams = getTypeParams(x);
        if (typeParams.length) {
            ys.push("[");
            ys.push(mangleTypes(typeParams));
            ys.push("]");
        }
    }
    return ys.join("");
};

export function mangleTypeName(id: string, typeParams: TypeParam[]) {
    const ys = [];
    ys.push(`${id}`);
    if (typeParams.length) {
        ys.push("[");
        ys.push(mangleTypes(typeParams));
        ys.push("]");
    }
    return ys.join("");
}

export function mangleFunctionName(id: string, typeParams: Type[], takes: Type[]) {
    const ys = [];
    ys.push(`${id}`);
    if (typeParams.length) {
        ys.push("[");
        ys.push(mangleTypes(typeParams));
        ys.push("]");
    }
    if (takes.length) {
        ys.push("(");
        ys.push(mangleTypes(takes));
        ys.push(")");
    }
    return ys.join("");
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