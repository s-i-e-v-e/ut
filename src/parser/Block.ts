/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {Errors} from "../driver/mod.ts";
import {
    AstNode,
    BinaryExpr,
    BlockExpr,
    BooleanLiteral,
    CastExpr,
    DerefExpr,
    Expr,
    ForExpr,
    FunctionApplication,
    FunctionDef,
    GroupExpr,
    ID,
    IDExpr,
    IDRef,
    IfExpr,
    ImportExpr,
    ImportRef,
    IntegerLiteral,
    Literal,
    LocalReturnExpr,
    Location,
    ModuleDef,
    NodeType,
    Ref,
    RefExpr,
    ReturnExpr,
    ScopeRef,
    StringLiteral,
    StructDef,
    TypeAliasExpr,
    TypeConsExpr,
    TypeParam,
    TypeParamRef,
    TypeRef,
    TypeSpec,
    TypeSpecRef,
    VarAssnExpr,
    VarInitExpr,
    VarSpec,
    VarSpecRef,
    VoidExpr
} from "./data.ts";
import {Dictionary, object_values} from "../common.ts";

// maintains nodeID -> node mapping
export class Registry {
    private static counter = -1;
    private static readonly refs: Dictionary<AstNode> = {};

    static buildRef(): Ref {
        Registry.counter += 1;
        return { hash: Registry.counter };
    };

    static register(x: AstNode): Ref {
        const r = x.nodeID;
        Registry.refs[r.hash] = x;
        return r;
    }

    static resolve(r: Ref): AstNode {
        return Registry.refs[r.hash] as AstNode;
    }

    static resolveID(r: IDRef) {
        return (this.resolve(r) as ID).name;
    }

    static resolveTypeSpec(r: TypeSpecRef) {
        return this.resolve(r) as TypeSpec;
    }

    static registerID(name: string): IDRef {
        const x: ID = {
            nodeID: Registry.buildRef(),
            nodeType: NodeType.ID,
            name: name,
        }
        return this.register(x);
    }

    static registerIDExpr(loc: Location, id: IDRef, rest: IDRef[]): IDExpr {
        const x: IDExpr = {
            nodeID: Registry.buildRef(),
            nodeType: NodeType.IDExpr,
            loc: loc,
            type: CompilerTypes.NotInferred,
            id: id,
            rest: rest,
        }
        this.register(x);
        return x;
    }

    static registerTypeIDExpr(loc: Location, id: IDRef) {
        return this.registerIDExpr(loc, id, []);
    }

    static registerTypeParam(loc: Location, id: IDRef): TypeParamRef {
        const x: TypeParam = {
            nodeID: Registry.buildRef(),
            nodeType: NodeType.TypeParam,
            loc: loc,
            id: id,
        };
        return this.register(x);
    }

    static registerTypeSpec(loc: Location, id: IDRef, typeSpecParams: TypeSpecRef[]): TypeSpecRef {
        const x: TypeSpec = {
            nodeID: Registry.buildRef(),
            nodeType: NodeType.TypeSpec,
            loc: loc,
            id: id,
            typeSpecParams: typeSpecParams,
        };
        return this.register(x);
    }

    static buildIntegerLiteral(loc: Location, v: bigint): IntegerLiteral {
        const x: IntegerLiteral = {
            nodeID: Registry.buildRef(),
            nodeType: NodeType.NumberLiteral,
            loc: loc,
            type: CompilerTypes.IntegerLiteral,
            value: v,
        };
        this.register(x);
        return x;
    }

    static buildBoolLiteral(loc: Location, v: boolean): BooleanLiteral {
        const x: BooleanLiteral = {
            nodeID: Registry.buildRef(),
            nodeType: NodeType.BooleanLiteral,
            loc: loc,
            type: CompilerTypes.BoolLiteral,
            value: v,
        };
        this.register(x);
        return x;
    }

    static buildStringLiteral(loc: Location, v: string): StringLiteral {
        const x: StringLiteral = {
            nodeID: Registry.buildRef(),
            nodeType: NodeType.StringLiteral,
            loc: loc,
            type: CompilerTypes.StringLiteral,
            value: v,
        };
        this.register(x);
        return x;
    }
}

export const Global = Registry.buildRef();
export const LanguageTypes = {
    SignedInt: Registry.buildRef(),
    UnsignedInt: Registry.buildRef(),
    Float: Registry.buildRef(),
    Void: Registry.buildRef(),
}

export const CompilerTypes = {
    NotInferred: Registry.buildRef(),
    Array: Registry.buildRef(),
    StringLiteral: Registry.buildRef(),
    IntegerLiteral: Registry.buildRef(),
    BoolLiteral: Registry.buildRef(),
}

type Resolve<T> = (st: Block, ref: Ref) => T;

export class TypeResolver {
    typeNotInferred(t: TypeRef) {
        return t === CompilerTypes.NotInferred;
    }

    typesMatch(expected: TypeRef, actual: TypeRef, noTypeParams: boolean = false): boolean {
        return Errors.notImplemented();
        /*
        const filter = (xs: P.Type[]) => xs.filter(x => x.id.length > 1);
        if (this.isInteger(ot1) && this.isInteger(ot2)) return true;

        let t1 = this.st.getType(ot1.id);
        let t2 = this.st.getType(ot2.id);

        t1 = noTypeParams ? ((t1 && filter(t1.typeParams).length >= filter(ot1.typeParams).length) ? t1 : ot1) : t1 || ot1;
        t2 = noTypeParams ? ((t2 && filter(t2.typeParams).length >= filter(ot2.typeParams).length) ? t2 : ot2) : t2 || ot2;

        Errors.ASSERT(!!t1, ot1.id);
        Errors.ASSERT(!!t2, ot2.id);

        if (t1.id !== t2.id) return false;
        if (t1.typeParams.length !== t2.typeParams.length) return false;

        for (let i = 0; i < t1.typeParams.length; i += 1) {
            if (!this.typesMatch(t1.typeParams[i], t2.typeParams[i], noTypeParams)) return false;
        }
        return true;*/
    }

    typesMustMatch(actual: TypeRef, expected: TypeRef, loc?: Location) {
        Errors.notImplemented();
        //loc = loc || actual.loc;
        //if (!this.typesMatch(t1, t2)) Errors.Checker.raiseTypeMismatch(t1, t2, loc);
    }

    isInteger(t: TypeSpecRef): boolean {
        return true;
        /*const x = this.rewriteType(t, true);
        switch (x.typetype) {
            case P.Types.Word:
            case P.Types.UnsignedInt:
            case P.Types.SignedInt:
            {
                return true;
            }
            default: {
                return false;
            }
        }*/
    }

    isBoolean(ref: TypeSpecRef): boolean {
        return this.typesMatch(ref, CompilerTypes.BoolLiteral);
    }
}

export class Block {
    public readonly blockID: ScopeRef;

    readonly imports: Dictionary<ImportExpr> = {};
    private readonly types: Dictionary<TypeConsExpr|TypeAliasExpr> = {};
    private readonly structs: Dictionary<StructDef> = {};
    private readonly functions: Dictionary<FunctionDef> = {};
    public readonly vars: Dictionary<VarSpec> = {};

    public readonly typeParams: TypeParamRef[] = [];
    public readonly params: VarSpecRef[] = [];
    public returns: TypeSpecRef = CompilerTypes.NotInferred;
    public readonly children: Block[] = [];
    public readonly body: Expr[] = [];

    public static build(id: IDRef, parent?: Block) {
        return new Block(id, parent);
    }

    constructor(public readonly id: IDRef, public readonly parent?: Block) {
        this.blockID = Registry.buildRef();
        if (parent) parent.children.push(this);
    }

    /** list **/
    public listFunctions() {
        return object_values(this.functions);
    }

    public listTypes() {
        return object_values(this.types);
    }

    public listStructs() {
        return object_values(this.structs);
    }

    public listImports() {
        const xs = object_values(this.imports);
        //[{id: D.NativeModule, loc: D.NativeLoc}]
        return xs;
    }

    /** exists **/
    private exists<T>(id: IDRef, resolve: Resolve<T>) {
        return this.get(id, resolve) !== undefined;
    }

    typeMustExist(t: TypeSpecRef) {
        if (!this.typeExists(t)) return Errors.Checker.raiseUnknownType(t);
    }

    // type exists in scope
    typeExists(t: TypeRef) {
        return this.exists(t, (sc, ref) => sc.types[ref.hash]);
    }

    /** resolve **/
    private get<T>(ref: Ref, resolve: Resolve<T>) {
        const mod = this.getModule();
        const t: Block = this;
        let xs = mod.getModules();
        xs = xs.filter(x => mod.imports[x.id.hash]);
        xs = [t].concat(...xs);

        for (let x of xs) {
            let table: Block|undefined = x;
            while (table) {
                const y: T = resolve(table, ref);
                if (y) return y;
                table = table.parent;
            }
        }
        return undefined;
    }

    private getModule() {
        let table: Block|undefined = this;
        let old: Block|undefined = this;
        while (table.parent) {
            old = table;
            table = table.parent;
        }
        return old;
    }

    private getModules() {
        let table: Block|undefined = this;
        while (table.parent) {
            table = table.parent;
        }
        const xs = object_values(table.children.filter(x => (x as Block).blockID !== undefined)) as Block[];
        return [table].concat(...xs);
    }

    /** get **/
    /* getType(id: string): P.Type|undefined {
         return this.getTypeAlias(id) || this.get(id, (st, id) => st.ns.types[id]);
     }

     getTypeCons(id: string): P.Type|undefined {
         const x = this.get(id, (st, id) => st.ns.typeDefinitions[id]) as P.TypeDef;
         if (x && x.isDef) {
             const y = this.getType(x.type.id) || x.type;
             return this.getTypeCons(y.id) || y;
         }
         else {
             return undefined;
         }
     }

     private getTypeAlias(id: string): P.Type|undefined {
         const x = this.get(id, (st, id) => st.ns.typeDefinitions[id]) as P.TypeAliasDef;
         if (x && x.isAlias) {
             return this.getType(x.type.id) || x.type;
         }
         else {
             return undefined;
         }
     }*/

    getVar(ref: VarSpecRef): VarSpec|undefined {
        return this.get(ref, (block, ref) => block.vars[ref.hash]);
    }

    /*getAllFunctions(id: string): P.FunctionPrototype[]|undefined {
        const  m = this.getModule();
        return Object.keys(m.ns.functions[id]).map(k => m.ns.functions[id][k]);
    }*/

    getFunction(id: string, loc: Location, typeParams: TypeParamRef[], argTypes: TypeSpecRef[]): FunctionDef|undefined {
        return Errors.notImplemented();
        /*return this.get(id, (st, id) => {
            if (!st.ns.functions[id]) return undefined;
            const mid = this.mangleName(id, typeParams, argTypes, P.Types.Compiler.NotInferred);
            if (st.ns.functions[id][mid]) return st.ns.functions[id][mid];
            const x = block.resolveFunction(id, mid, typeParams, argTypes, loc, st.ns.functions);
            if (x) {
                Logger.debug(`adding: ${x.mangledName}`);
                Errors.ASSERT(x.mangledName === mid, `[fn]${x.mangledName} != [use]${mid}`);
                st.addFunction(x);
            }
            return x;
        });*/
    }

    getStruct(id: IDRef, loc?: Location, typeParams?: TypeParamRef[], argTypes?: TypeSpecRef[]): StructDef|undefined {
        return Errors.notImplemented();
        /*return this.get(id, (block, ref) => {
            typeParams =  typeParams || [];
            argTypes =  argTypes || [];
            loc = loc || UnknownLocation;
            if (!block.structs[ref]) return undefined;

            const mid = this.mangleName(ref, typeParams, argTypes, Block.CompilerTypes.NotInferred);
            if (block.structs[id][mid]) return block.structs[id][mid];
            const x = block.resolver.resolveFunction(id, mid, typeParams, argTypes, loc, st.ns.structs);
            if (x) {
                Logger.debug(`adding: ${x.mangledName}`);
                Errors.ASSERT(x.mangledName === mid, `[st]${x.mangledName} != [use]${mid}`);
                block.addStruct(x);
                return x;
            }
            else {
                return Object.keys(st.ns.structs[id]).map(k => st.ns.structs[id][k])[0];
            }
        });*/
    }

    private mangleName(id: IDRef, typeParams: TypeParamRef[], argTypes: TypeSpecRef[], returns?: TypeSpecRef) {
        const mangleTypes = (xs: TypeSpecRef[]): string => {
            const ys = [];
            for (const x of xs) {
                const t = Registry.resolveTypeSpec(x);
                const tID = Registry.resolveID(t.id);
                ys.push(`$${tID}`);
                if (t.typeSpecParams.length) {
                    ys.push("[");
                    ys.push(mangleTypes(t.typeSpecParams));
                    ys.push("]");
                }
            }
            return ys.join("");
        };

        const ys = [];
        ys.push(`${Registry.resolveID(id)}`);
        if (typeParams.length) {
            ys.push("[");
            ys.push(mangleTypes(typeParams));
            ys.push("]");
        }
        ys.push("(");
        ys.push(mangleTypes(argTypes));
        ys.push(")");
        return ys.join("");
    }

    /** add **/


    addTypeConsDef(loc: Location, id: IDRef, typeParams: TypeParamRef[], type: TypeRef, args: Literal<any>[]): TypeRef {
        const x: TypeConsExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.TypeConsDef,
            loc: loc,
            id: id,
            typeParams: typeParams,
            type: type,
            args: args,
        };
        this.types[x.nodeID.hash] = x;
        return this.set(x);
    }

    addTypeAliasDef(loc: Location, id: IDRef, typeParams: TypeParamRef[], type: TypeRef) {
        const x: TypeAliasExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.TypeAliasDef,
            loc: loc,
            id: id,
            typeParams: typeParams,
            type: type,
        };
        this.types[x.nodeID.hash] = x;
        return this.set(x);
    }

    addImportExpr(loc: Location, id: IDRef, rest: IDRef[]): ImportRef {
        //const id = xs.map(x => this.get(x) as ID).join(".");
        const x: ImportExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.ImportExpr,
            loc: loc,
            id: id,
            rest: rest,
        };
        this.imports[x.nodeID.hash] = x;
        return this.set(x)
    }

    addVarSpec(loc: Location, id: IDRef, type: TypeRef, isMutable: boolean, isVararg: boolean, isPrivate: boolean): VarSpecRef {
        const x: VarSpec = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.VarSpec,
            loc: loc,
            type: type,
            id: id,
            isMutable: isMutable,
            isPrivate: isPrivate,
            isVararg: isVararg,
        };
        this.vars[x.nodeID.hash] = x;
        this.params.push(x.nodeID);
        return this.set(x);
    }

    ///
    addIfExpr(loc: Location, cond: Expr, ifBranch: BlockExpr, elseBranch: BlockExpr) {
        const x: IfExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.IfExpr,
            loc: loc,
            type: Block.CompilerTypes.NotInferred,
            isStmt: false,
            condition: cond,
            ifBranch: ifBranch,
            elseBranch: elseBranch,
        };
        this.set(x);
        return x;
    }

    addApplication(id: IDExpr, typeParams: TypeParamRef[], xs: Expr[]): FunctionApplication {
        const x: FunctionApplication = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.FunctionApplication,
            loc: id.loc,
            type: Block.CompilerTypes.NotInferred,
            id: id,
            typeParams: typeParams,
            args: xs,
        };
        this.set(x);
        return x;
    }

    addCastExpr(e: Expr, type: TypeSpecRef): CastExpr {
        const x: CastExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.CastExpr,
            loc: e.loc,
            type: type,
            expr: e,
        };
        this.set(x);
        return x;
    }

    addRefExpr(loc: Location, e: Expr): RefExpr {
        const x: RefExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.ReferenceExpr,
            loc: loc,
            type: Block.CompilerTypes.NotInferred,
            expr: e,
        };
        this.set(x);
        return x;
    }

    addDerefExpr(loc: Location, e: IDExpr|DerefExpr): DerefExpr {
        const x: DerefExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.DereferenceExpr,
            loc: loc,
            type: Block.CompilerTypes.NotInferred,
            expr: e,
        };
        this.set(x);
        return x;
    }

    addGroupExpr(loc: Location, e: Expr): GroupExpr {
        const x: GroupExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.GroupExpr,
            loc: loc,
            type: Block.CompilerTypes.NotInferred,
            expr: e,
        };
        this.set(x);
        return x;
    }

    addReturnExpr(loc: Location, e: Expr) {
        const x: ReturnExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.ReturnExpr,
            loc: loc,
            type: Block.CompilerTypes.NotInferred,
            expr: e,
        };
        this.set(x);
        return x;
    }

    addLocalReturnExpr(loc: Location, e: Expr) {
        const x: LocalReturnExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.LocalReturnExpr,
            loc: loc,
            type: Block.CompilerTypes.NotInferred,
            expr: e,
        };
        this.set(x);
        return x;
    }

    addVarAssnExpr(le: Expr, re: Expr): VarAssnExpr {
        const x: VarAssnExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.VarAssnExpr,
            loc: le.loc,
            type: Block.LanguageTypes.Void,
            lhs: le,
            rhs: re,
        };
        this.set(x);
        return x;
    }

    addVarInitExpr(loc: Location, v: VarSpecRef, e: Expr) {
        const x: VarInitExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.VarInitExpr,
            loc: loc,
            type: Block.LanguageTypes.Void,
            var: v,
            expr: e,
        };
        this.set(x);
        return x;
    }

    addBinaryExpr(left: Expr, op: string, right: Expr): BinaryExpr {
        const x: BinaryExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.BinaryExpr,
            loc: left.loc,
            type: Block.CompilerTypes.NotInferred,
            left: left,
            op: op,
            right: right,
        };
        this.set(x);
        return x;
    }

    addVoidExpr(loc: Location) {
        const x: VoidExpr = {
            nodeID: Block.buildRef(),
            nodeType: NodeType.VoidExpr,
            loc: loc,
            type: Block.CompilerTypes.NotInferred,
        };
        this.set(x);
        return x;
    }

    newForExpr(loc: Location, init: VarInitExpr|undefined, cond: Expr|undefined, update: VarAssnExpr|undefined) {
        return new ForExpr(loc, Block.buildRef(), init, cond, update, this.addID("for"), this);
    }

    newBlock(loc: Location) {
        return new BlockExpr(loc, Block.buildRef(), this.addID("block"), this);
    }

    newStruct(loc: Location, id: IDRef) {
        const x = new StructDef(loc, id, this);
        this.structs[x.blockID.hash] = x;
        return x;
    }

    newFunction(loc: Location, id: IDRef){
        const x = new FunctionDef(loc, id, this);
        this.functions[x.blockID.hash] = x;
        return x;
    }

    newModule(loc: Location, id: IDRef, path: string) {
        return new ModuleDef(path, id, this);
    }
}