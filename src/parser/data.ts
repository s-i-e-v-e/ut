/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {Dictionary, Errors, Logger} from "../driver/mod.ts";

/*** lexer/parser/semantics ***/
export interface Location {
    line: number;
    character: number;
    index: number;
    path: string;
}

export const NativeModule = "<native>";

export const UnknownLocation = {
    index: 0,
    line: 1,
    character: 1,
    path: "<unknown>",
};

export const NativeLoc = {
    index: 0,
    line: 1,
    character: 1,
    path: NativeModule,
};

/*** lexer/parser ***/
export enum TokenType {
    TK_WHITESPACE = 128,
    TK_COMMENT,
    TK_ID,
    TK_MULTI_ID,
    TK_TYPE,
    TK_STRING_LITERAL,
    TK_BOOLEAN_LITERAL,
    TK_BINARY_NUMBER_LITERAL,
    TK_OCTAL_NUMBER_LITERAL,
    TK_DECIMAL_NUMBER_LITERAL,
    TK_HEXADECIMAL_NUMBER_LITERAL,
    TK_INTERNAL
}

export interface Token {
    loc: Location,
    type: TokenType,
    lexeme: string,
    xs: string[],
}

/*** parser/semantics ***/
export enum NodeType {
    ModuleDef,
    ImportExpr,
    StructDef,
    TypeAliasDef,
    TypeConsDef,
    FunctionDef,

    VarSpec,
    ID,
    TypeSpec,
    TypeParam,

    VarInitExpr,
    VarAssnExpr,
    ForExpr,
    ReturnExpr,

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
}

export interface Ref {
    hash: number;
}

export interface NodeRef extends Ref {}
export interface ScopeRef extends Ref {}
//-
export interface ImportRef extends Ref {}
export interface TypeRef extends Ref {}
export interface TypeParamRef extends Ref {}
export interface TypeSpecRef extends Ref {}
export interface VarSpecRef extends Ref {}
export interface IDRef extends Ref {}

/** defs **/
export interface AstNode {
    nodeID: NodeRef,
    nodeType: NodeType,
}

export interface Leaf extends AstNode {}

export interface ID extends Leaf {
    name: string;
}

export interface Branch extends AstNode {
    loc: Location,
}

/** defexpr **/
export interface DefExpr extends Branch {
    id: IDRef;
}

export interface VarSpec extends DefExpr {
    type: TypeSpecRef;
    isMutable: boolean;
    isPrivate: boolean;
    isVararg: boolean;
}

export interface TypeParam extends DefExpr {}

export interface TypeSpec extends DefExpr {
    typeSpecParams: TypeSpecRef[];
}

export interface ImportExpr extends DefExpr {
    rest: IDRef[];
}

export interface TypeConsExpr extends DefExpr {
    type: TypeRef;
    typeParams: TypeParamRef[]
    args: Literal<any>[];
}

export interface TypeAliasExpr extends DefExpr {
    type: TypeRef;
    typeParams: TypeParamRef[]
}

/** exprs **/
export interface Expr extends Branch {
    type: TypeRef,
}

export interface VarInitExpr extends Expr {
    var: VarSpecRef;
    expr: Expr;
}

export interface VarAssnExpr extends Expr {
    lhs: Expr;
    rhs: Expr;
}

export interface ReturnExpr extends Expr {
    expr: Expr;
}

export interface VoidExpr extends Expr {}

export interface IDExpr extends Expr {
    id: IDRef;
    rest: IDRef[];
}

export interface ArrayExpr extends Expr {
    expr: IDExpr;
    args: Expr[];
}

export interface DerefExpr extends Expr {
    expr: IDExpr|DerefExpr;
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
    type: TypeRef,
}

export interface RefExpr extends Expr {
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
    id: IDExpr;
    typeParams: TypeParamRef[];
    args: Expr[];
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
    type: TypeRef,
    value: T;
}

export type StringLiteral = Literal<string>;
export type BooleanLiteral = Literal<boolean>;
export type IntegerLiteral = Literal<bigint>;

export function node_str(n: NodeType) {
    return NodeType[n];
}



/** scope **/


export class ModuleDef extends Block {
    constructor(public readonly path: string, id: IDRef, parent?: Block) {
        super(id, parent);
    }
}
export class StructDef extends Block {
    constructor(public readonly loc: Location, id: IDRef, parent?: Block) {
        super(id, parent);
    }
}

export class FunctionDef extends Block {
    constructor(public readonly loc: Location, id: IDRef, parent?: Block) {
        super(id, parent);
    }
}

export class BlockExpr extends Block {
    public readonly nodeID: NodeRef;
    public readonly nodeType = NodeType.BlockExpr;
    public type: TypeRef = Block.CompilerTypes.NotInferred;

    constructor(public readonly loc: Location, nodeID: NodeRef, id: IDRef, parent?: Block) {
        super(id, parent);
        this.nodeID = nodeID;
    }
}

export class ForExpr extends Block {
    public readonly nodeID: NodeRef;
    public readonly nodeType = NodeType.ForExpr;
    public type: TypeRef = Block.CompilerTypes.NotInferred;
    public readonly init: VarInitExpr|undefined;
    public readonly cond: Expr|undefined;
    public readonly update: VarAssnExpr|undefined;
    constructor(public readonly loc: Location, nodeID: NodeRef, init: VarInitExpr|undefined, cond: Expr|undefined, update: VarAssnExpr|undefined, id: IDRef, parent?: Block) {
        super(id, parent);
        this.nodeID = nodeID;
        this.init = init;
        this.cond = cond;
        this.update = update;
    }
}