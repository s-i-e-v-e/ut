/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    P,
    A,
} from "../parser/mod.ts";
import {
    VmCodeBuilder
} from "../vm/mod.ts";
import {
    Errors, Int,
    Logger,
    ByteBuffer,
} from "../util/mod.ts";
import {
    Allocator, newStructState,
    Store,
    StructState,
} from "./mod.ts";
import {resolveVar} from "../semantics/mod.internal.ts";

const NodeType = A.NodeType;
type Expr = A.Expr;
type Stmt = A.Stmt;

/*
0 = readvalue
1 = writevalue
2 = readmem
3 = writemem
 */
enum StoreAccess {
    Read,
    Reg = 0,
    Write,
    Mem,

    ReadReg = Read | Reg,
    WriteReg = Write | Reg,
    ReadMem = Read | Mem,
    WriteMem = Write | Mem,
}

function derefer(store: Store, r: Store, sizeInBytes: number, access: StoreAccess) {
    const isWrite = (access & StoreAccess.Write) === StoreAccess.Write;
    const isMem = (access & StoreAccess.Mem) === StoreAccess.Mem;
    if (isWrite) {
        if (isMem) {
            store.write_from_mem(r, sizeInBytes); // store = [r];
        }
        else {
            store.write_reg(r); // store = r;
        }
    }
    else {
        if (isMem) {
            r.write_to_mem(store, sizeInBytes); // [r] = store;
        }
        else {
            r.write_reg(store); // r = store;
        }
    }
}

function computeStructInfo(ss: StructState, block: A.BlockExpr, v: P.Variable, id: string) {
    const update = (v: P.Variable, id: string) => {
        const nn = P.Types.nativeSizeInBits(v.type);
        Errors.ASSERT(!v.isVararg && nn !== undefined, `Size must be known at compile-time: ${v.id}`, v.loc);
        const n = nn/8;
        const x = {
            offset: ss.offset,
            size: n,
        };
        ss.xs[ss.index] = x;
        ss.map[id] = ss.index;
        ss.offset += x.size;
        ss.index += 1;
    };

    const s: P.StructDef|undefined = block.tag.getConcreteStruct(v.type.id, v.type.mangledName);
    if (!s)  {
        update(v, id);
    }
    else {
        Logger.debug2(`@ => ${s.id}:${s.id}`);
        for (let i = 0; i < s.params.length; i += 1) {
            const m = s.params[i];
            const mid = `${id}.${m.id}`;
            Logger.debug2(`#${mid}:${m.type.id}`);
            computeStructInfo(ss, block, m, mid);
        }
    }
}

function doApplication(ac: Allocator, store: Store, block: A.BlockExpr, x: A.FunctionApplication, access: StoreAccess) {
    if (x.expr.id === P.Types.Array) {
        const ty = block.tag.getType(x.type.typeParams[0]) || x.type.typeParams[0];
        const args = x.args!;
        const nn = P.Types.nativeSizeInBits(ty);
        Errors.ASSERT(nn !== undefined, `Arg size must be known at compile-time`, x.expr.loc);
        const entrySizeInBytes = nn/8;
        const bufferSize = entrySizeInBytes*args.length;

        const bb = ByteBuffer.build(8 + 8 + bufferSize);
        // write static data known at compile time
        bb.write_u64(args.length);
        bb.write_u64(entrySizeInBytes);
        for (let i = 0; i < bufferSize; i += 1) {
            bb.write_u8(0xCC);
        }

        // get offset
        const offset = ac.b.staticHeapStore(bb.asBytes());

        // write dynamic data
        const r0 = ac.from("r0");
        let hp = offset + 8 + 8;
        for (let i = 0; i < args.length; i += 1) {
            emitExpr(ac, r0, block, args[i], StoreAccess.WriteMem);
            ac.b.mov_m_r(hp, r0.reg, entrySizeInBytes);
            hp += 8;
        }

        store.write_imm(Int(offset));
    }
    else {
        Errors.debug();
        // push used regs to stack
        const saved = ac.save();

        const r0 = ac.from("r0");
        // put args in  r1 ... rN
        for (let i = 0; i < x.args.length; i += 1) {
            emitExpr(ac, r0, block, x.args[i], StoreAccess.Write);
            const rd = ac.from(`r${i+1}`);
            copyValue(ac, block, x.args[i].type, rd, r0);
        }
        ac.b.call(x.mangledName!);

        // pop used regs from stack
        ac.restore(saved);

        store.write_reg(ac.from("r0"));
    }
}

function emitExpr(ac: Allocator, store: Store, block: A.BlockExpr, e: Expr, access: StoreAccess) {
    switch (e.nodeType) {
        case NodeType.BooleanLiteral: {
            const x = e as A.BooleanLiteral;
            store.write_imm(x.value ? 1n : 0n);
            break;
        }
        case NodeType.StringLiteral: {
            const x = e as A.StringLiteral;
            store.write_imm_str(x.value);
            break;
        }
        case NodeType.NumberLiteral: {
            const x = e as A.NumberLiteral;
            store.write_imm(x.value);
            break;
        }
        case NodeType.BinaryExpr: {
            const x = e as A.BinaryExpr;

            const t1 = ac.tmp();
            const t2 = ac.tmp();
            emitExpr(ac, t1, block, x.left, StoreAccess.Write);
            emitExpr(ac, t2, block, x.right, StoreAccess.Write);

            switch (x.op) {
                case "*": {
                    ac.b.mul_r_r(t1.reg, t2.reg);
                    break;
                }
                case "/": {
                    ac.b.div_r_r(t1.reg, t2.reg);
                    break;
                }
                case "%": {
                    ac.b.mod_r_r(t1.reg, t2.reg);
                    break;
                }
                case "+": {
                    ac.b.add_r_r(t1.reg, t2.reg);
                    break;
                }
                case "-": {
                    ac.b.sub_r_r(t1.reg, t2.reg);
                    break;
                }
                case "==": {
                    ac.b.cmp_r_r(t1.reg, t2.reg);
                    ac.b.sete(t1.reg);
                    break;
                }
                case "!=": {
                    ac.b.cmp_r_r(t1.reg, t2.reg);
                    ac.b.setne(t1.reg);
                    break;
                }
                case "&": {
                    ac.b.and_r_r(t1.reg, t2.reg);
                    break;
                }
                case "|": {
                    ac.b.or_r_r(t1.reg, t2.reg);
                    break;
                }
                case "<": {
                    ac.b.cmp_r_r(t1.reg, t2.reg);
                    ac.b.setlt(t1.reg);
                    break;
                }
                case ">": {
                    ac.b.cmp_r_r(t1.reg, t2.reg);
                    ac.b.setgt(t1.reg);
                    break;
                }
                case "<=": {
                    ac.b.cmp_r_r(t1.reg, t2.reg);
                    ac.b.setle(t1.reg);
                    break;
                }
                case ">=": {
                    ac.b.cmp_r_r(t1.reg, t2.reg);
                    ac.b.setge(t1.reg);
                    break;
                }
                default: Errors.raiseDebug(x.op);
            }

            store.write_reg(t1);
            t1.free();
            t2.free();
            break;
        }
        case NodeType.FunctionApplication:{
            doApplication(ac, store, block, e as A.FunctionApplication, access);
            break;
        }
        case NodeType.TypeInstance: {
            const x = e as A.FunctionApplication;

            // compute struct info
            const ss = newStructState();
            const v = P.Types.buildVar("tmp", x.type, true, false, false, x.loc);
            computeStructInfo(ss, block, v, v.id);

            const bb = ByteBuffer.build(ss.offset);
            // write static data known at compile time
            for (let i = 0; i < ss.offset; i += 1) {
                bb.write_u8(0xCC);
            }

            // get offset
            const offset = ac.b.staticHeapStore(bb.asBytes());

            // write dynamic data
            const tmp = ac.tmp();
            let hp = offset;
            for (let i = 0; i < x.args.length; i += 1) {
                emitExpr(ac, tmp, block, x.args[i], StoreAccess.Write);
                ac.b.mov_m_r(hp, tmp.reg, ss.xs[i].size);
                hp += ss.xs[i].size;
            }
            tmp.free();

            store.write_imm(Int(offset));
            break;
        }/*
        case NodeType.DereferenceExpr: {
            const x = e as A.DereferenceExpr;

            const r = ac.tmp();
            emitExpr(ac, r, block, x.expr);
            derefer(store, r, 0xDEAD - 0xDEAD + 8); //todo: size in bytes = ???
            r.free();
            break;
        }*/
        case NodeType.IDExpr: {
            const x = e as A.IDExpr;
            const mv: Store = ac.get(x.id);

            if (x.rest.length) {
                const tmp = ac.tmp();

                const id = [x.id].concat(...x.rest).join(".");
                const sm = mv.ss.xs[mv.ss.map[id]];
                if (!sm) Errors.raiseDebug(`Unknown var: ${id}`, x.loc);

                tmp.write_reg(mv);  // tmp = mv
                ac.b.add_r_i(tmp.reg, sm.offset);
                derefer(store, tmp, sm.size, StoreAccess.Mem);

                tmp.free();
            }
            else {
                derefer(store, mv, 8, StoreAccess.Reg);
            }
            break;
        }
        case NodeType.ArrayExpr: {
            Errors.debug();
            const x = e as A.ArrayExpr;

            // get index
            const index = ac.tmp();
            emitExpr(ac, index, block, x.arg, StoreAccess.Write);

            // compute element offset
            const base = ac.get(x.expr.id);

            // tmp = ([base + 8] * index)
            const tmp = ac.tmp();
            ac.b.mov_r_r(tmp.reg, base.reg);
            ac.b.add_r_i(tmp.reg, 8);
            ac.b.mov_r_ro(tmp.reg, tmp.reg, 8);
            ac.b.mul_r_r(tmp.reg, index.reg);

            // tmp = tmp + base + 8 + 8
            ac.b.add_r_i(tmp.reg, 16);
            ac.b.add_r_r(tmp.reg, base.reg);

            // update
            derefer(store, tmp, 0xDEAD - 0xDEAD + 8, StoreAccess.Mem); // todo: array entries are 8 bytes each

            index.free();
            tmp.free();
            break;
        }
        case NodeType.LocalReturnExpr: {
            const x = e as A.LocalReturnExpr;
            emitExpr(ac, store, block, x.expr, access);
            break;
        }
        case NodeType.IfExpr: {
            const x = e as A.IfExpr;

            const r = ac.tmp();
            emitExpr(ac, r, block, x.condition, access);
            ac.b.cmp_r_i(r.reg, 1);
            r.free();

            const gotoElse = `else-${ac.b.codeOffset()}`;
            ac.b.jnz(gotoElse);

            emitBlock(ac, store, x.ifBranch);
            const gotoEnd = `end-${ac.b.codeOffset()}`;
            ac.b.jmp(gotoEnd);

            const elseOffset = ac.b.codeOffset();
            emitBlock(ac, store, x.elseBranch);
            const endOffset = ac.b.codeOffset();

            ac.b.mapCodeOffset(gotoElse, elseOffset);
            ac.b.mapCodeOffset(gotoEnd, endOffset);
            break;
        }
        case NodeType.CastExpr: {
            const x = e as A.CastExpr;
            emitExpr(ac, store, block, x.expr, access);
            break;
        }
        case NodeType.VoidExpr: {
            break;
        }
        case NodeType.ReferenceExpr: {
            const x = e as A.ReferenceExpr;
            emitExpr(ac, store, block, x.expr, StoreAccess.Write);
            break;
        }
        case NodeType.BlockExpr: {
            const x = e as A.BlockExpr;
            emitBlock(ac, store, x);
            break;
        }
        case NodeType.GroupExpr: {
            const x = e as A.GroupExpr;
            emitExpr(ac, store, block, x.expr, access);
            break;
        }
        case NodeType.NegationExpr: {
            const x = e as A.NegationExpr;
            emitExpr(ac, store, block, x.expr, access);
            ac.b.bitwise_not(store.reg);
            break;
        }
        case NodeType.NotExpr: {
            const x = e as A.NegationExpr;
            emitExpr(ac, store, block, x.expr, access);
            ac.b.logical_not(store.reg);
            break;
        }
        default: Errors.raiseDebug(NodeType[e.nodeType]);
    }
}

function bindValue(ac: Allocator, block: A.BlockExpr, v: P.Variable) {
    const rd = ac.alloc(v);
    if (block.tag.isStruct(v.type)) {
        const ss = newStructState();
        computeStructInfo(ss, block, v, v.id);
        rd.ss = ss;
    }
    return rd;
}

/**
 *  When is a value copied:
 *  --Init
 *  let a = "hello";
 *  --Assignment
 *  xs(0) = a;
 *  x.city = "London";
 *  -- Application
 *  let b = P1(a);
 *  let c = println(a); // println(String)
 */
function copyValue(ac: Allocator, block: A.BlockExpr, type: P.Type, rd: Store, r0: Store) {
    function copyStruct() {
        const rs = ac.tmp();
        Errors.ASSERT(rs.reg !== r0.reg, rs.reg);
        rs.write_reg(r0);

        if (block.tag.resolver.typesMatch(type, P.Types.Language.String)) {
            // allocate memory: string.length + 8
            ac.b.mov_r_ro(r0.reg, rs.reg, 8);
            ac.b.add_r_i(r0.reg, 8);
            ac.b.dynamic_mem_alloc(rd.reg, r0.reg);

            // copy string length + data
            ac.b.copy(rd.reg, rs.reg, r0.reg);
        }
        else if (block.tag.resolver.typesMatch(type, P.Types.Compiler.Array)) {
            // allocate memory: array data length + 8 + 8

            const tmp = ac.tmp();
            ac.b.mov_r_ro(r0.reg, rs.reg, 8); // length

            ac.b.add_r_i(rs.reg, 8);
            ac.b.mov_r_ro(tmp.reg, rs.reg, 8); // stride
            ac.b.sub_r_i(rs.reg, 8);

            ac.b.mul_r_r(r0.reg, tmp.reg); // length * stride
            ac.b.add_r_i(r0.reg, 16);
            ac.b.dynamic_mem_alloc(rd.reg, r0.reg);

            // copy array length + stride + data
            ac.b.copy(rd.reg, rs.reg, r0.reg);
            tmp.free();
        }
        else {
            ac.b.mov_r_i(r0.reg, Int(rd.ss.offset));
            ac.b.copy(rd.reg, rs.reg, r0.reg);
        }
        rs.free();
    }

    Errors.ASSERT(r0.reg === "r0");
    if (rd.ss.offset) {
        copyStruct();
    }
    else {
        rd.write_reg(r0);
    }
}

function emitStmt(ac: Allocator, store: Store, block: A.BlockExpr, s: Stmt) {
    Logger.debug("##===========##");
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as A.VarInitStmt;
            const r0 = ac.from("r0");
            const rd = bindValue(ac, block, x.var);
            emitExpr(ac, r0, block, x.expr, StoreAccess.Write);
            copyValue(ac, block, x.var.type, rd, r0);
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as A.VarAssnStmt;
            const r0 = ac.from("r0");
            const v = resolveVar(block.tag, x.lhs);
            const rd = bindValue(ac, block, v);
            emitExpr(ac, rd, block, x.lhs, StoreAccess.Write);
            emitExpr(ac, r0, block, x.rhs, StoreAccess.Write);
            copyValue(ac, block, v.type, rd, r0);
            break;
        }
        case NodeType.ReturnStmt: {
            const x = s as A.ReturnStmt;
            emitExpr(ac, store, block, x.expr, StoreAccess.Write);
            ac.b.ret();
            break;
        }
        case NodeType.ExprStmt: {
            const x = s as A.ExprStmt;
            emitExpr(ac, store, block, x.expr, StoreAccess.Write);
            break;
        }
        case NodeType.ForStmt: {
            const x = s as A.ForStmt;

            if (x.init) emitStmt(ac, store, x.forBlock, x.init);

            const startOffset = ac.b.codeOffset();
            const gotoStart = `start-${startOffset}`;
            let gotoEnd = ";"

            if (x.condition) {
                const r = ac.tmp();
                emitExpr(ac, r, x.forBlock, x.condition, StoreAccess.Write);
                ac.b.cmp_r_i(r.reg, 1);
                gotoEnd = `end-${ac.b.codeOffset()}`;
                ac.b.jnz(gotoEnd);
                r.free();
            }

            emitBlock(ac, store, x.body);
            if (x.update) emitStmt(ac, store, x.forBlock, x.update);
            ac.b.jmp(gotoStart);
            const endOffset = ac.b.codeOffset();

            ac.b.mapCodeOffset(gotoStart, startOffset);
            if (gotoEnd) ac.b.mapCodeOffset(gotoEnd, endOffset);

            break;
        }
        default: Errors.raiseDebug(NodeType[s.nodeType]);
    }
}

function emitBlock(ac: Allocator, store: Store, block: A.BlockExpr) {
    ac = ac.newAllocator();
    block.xs.forEach(x => emitStmt(ac, store, block, x));
}

function emitFunction(b: VmCodeBuilder, f: P.FunctionDef) {
    b.startFunction(f.mangledName);
    const ac = Allocator.build(b);
    const r0 = ac.tmp();
    f.params.forEach(x => bindValue(ac, f.body, x));
    Errors.ASSERT(r0.reg === "r0", r0.reg);
    emitBlock(ac, r0, f.body);
    b.ret();
}

export default function vm_gen_code(mods: P.Module[]) {
    const reduce = <A>(ys: A[], xs: A[]) => { ys.push(...xs); return ys;  };
    const foreignFunctions = mods.map(x => x.foreignFunctions).reduce(reduce);
    const functions = mods.map(x => x.functions).reduce(reduce);

    const b = VmCodeBuilder.build();

    foreignFunctions.forEach(x => b.addForeignFunction(x.mangledName));

    // first, main
    const xs = functions.filter(x => x.id === "main");
    const main = xs.length ? xs[0] : undefined;
    if (!main) Errors.raiseVmError("main() not found");
    emitFunction(b, main!);

    // then, rest
    const ys = functions.filter(x => x.id !== "main");
    ys.forEach(x => emitFunction(b, x));

    return b;
}