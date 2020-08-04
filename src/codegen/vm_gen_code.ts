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
    ByteBuffer,
    VmCodeBuilder
} from "../vm/mod.ts";
import {
    Errors,
    Logger,
} from "../util/mod.ts";
import {
    Allocator, newStructState,
    Store,
    StructState,
} from "./mod.ts";
const NodeType = A.NodeType;
type Expr = A.Expr;
type Stmt = A.Stmt;

function derefer(store: Store, r: Store) {
    if (store.isWrite) {
        if (store.isValue) {
            store.write_from_mem(r);
        }
        else {
            store.write_reg(r);
        }
    }
    else {
        if (store.isRHS) {
            if (store.isValue) {
                r.write_from_mem(store);
            }
            else {
                r.write_reg(store);
            }
        }
        else {
            if (store.isValue) {
                r.write_to_mem(store);
            }
            else {
                r.write_reg(store);
            }
        }
    }
}

function computeStructInfo(ss: StructState, block: A.BlockExpr, v: P.Variable, id: string) {
    const update = (v: P.Variable, id: string) => {
        const n = v.type.native.bits/8;
        Errors.ASSERT(n !== 0, id, v.loc);
        const x = {
            offset: ss.offset,
            size: n,
        };
        ss.xs[ss.index] = x;
        ss.map[id] = ss.index;
        ss.offset += x.size;
        ss.index += 1;
    };

    const s: P.StructDef|undefined = block.tag.getStruct(v.type.id);
    if (!s)  {
        update(v, id);
    }
    else {
        Logger.debug2(`@ => ${s.id}:${s.id}::${s.typetype}`);
        for (let i = 0; i < s.params.length; i += 1) {
            const m = s.params[i];
            const mid = `${id}.${m.id}`;
            Logger.debug2(`#${mid}:${m.type.id}::${m.type.typetype}`);
            if (m.type.native.bits !== 0) {
                update(m, mid);
            }
            else {
                update(m, mid);
                computeStructInfo(ss, block, m, mid);
            }
        }
    }
}

function doApplication(ac: Allocator, store: Store, block: A.BlockExpr, x: A.FunctionApplication) {
    if (x.expr.id === P.Types.Array) {
        const ty = block.tag.getType(x.type.typeParams[0]) || x.type.typeParams[0];
        const args = x.args!;
        const n = args.length;
        const entrySizeInBytes = 8;//ty.native.bits/8;
        const bufferSize = entrySizeInBytes*args.length;

        const bb = ByteBuffer.build(8 + 8 + bufferSize);
        // write static data known at compile time
        bb.write_u64(n);
        bb.write_u64(entrySizeInBytes);
        for (let i = 0; i < bufferSize; i += 1) {
            bb.write_u8(0xCC);
        }

        // get offset
        const offset = ac.b.heapStore(bb.asBytes());

        // write dynamic data
        const tmp = ac.tmp();
        let hp = offset + 8 + 8;
        for (let i = 0; i < args.length; i += 1) {
            emitExpr(ac, tmp, block, args[i]);
            ac.b.mov_m_r(hp, tmp.reg);
            hp += 8;
        }
        tmp.free();

        store.write_imm(BigInt(offset));
    }
    else {
        // push used regs to stack
        const saved = ac.save();

        // put args in  r1 ... rN
        for (let i = 0; i < x.args.length; i += 1) {
            const r = ac.from(`r${i+1}`);
            emitExpr(ac, r, block, x.args[i]);
        }
        ac.b.call(x.mangledName!);

        // pop used regs from stack
        ac.restore(saved);

        store.write_reg(ac.from("r0"));
    }
}

function emitExpr(ac: Allocator, store: Store, block: A.BlockExpr, e: Expr) {
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
            emitExpr(ac, t1, block, x.left);
            emitExpr(ac, t2, block, x.right);

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
        case NodeType.FunctionApplication: {
            doApplication(ac, store, block, e as A.FunctionApplication);
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
            const offset = ac.b.heapStore(bb.asBytes());

            // write dynamic data
            const tmp = ac.tmp();
            let hp = offset;
            for (let i = 0; i < x.args.length; i += 1) {
                emitExpr(ac, tmp, block, x.args[i]);
                ac.b.mov_m_r(hp, tmp.reg);
                hp += ss.xs[i].size;
            }
            tmp.free();

            store.write_imm(BigInt(offset));
            break;
        }
        case NodeType.DereferenceExpr: {
            const x = e as A.DereferenceExpr;

            const r = ac.tmp();
            emitExpr(ac, r, block, x.expr);
            derefer(store, r);
            r.free();
            break;
        }
        case NodeType.IDExpr: {
            const x = e as A.IDExpr;
            const mv: Store = ac.get(x.id);

            if (!x.rest.length) {
                if (store.isWrite) {
                    store.write_reg(mv);
                }
                else {
                    mv.write_reg(store);
                }
            }
            else {
                const tmp = ac.tmp();

                const id = [x.id].concat(...x.rest).join(".");
                const sm = mv.ss.xs[mv.ss.map[id]];
                if (!sm) Errors.raiseDebug(`Unknown var: ${id}`);

                tmp.write_reg(mv);  // tmp = mv
                ac.b.add_r_i(tmp.reg, sm.offset);
                derefer(store, tmp);

                tmp.free();
            }
            break;
        }
        case NodeType.ArrayExpr: {
            const x = e as A.ArrayExpr;

            // get index
            const index = ac.tmp();
            emitExpr(ac, index, block, x.args[0]);

            // compute element offset
            const base = ac.get(x.expr.id);

            // tmp = ([base + 8] * index)
            const tmp = ac.tmp();
            ac.b.mov_r_r(tmp.reg, base.reg);
            ac.b.add_r_i(tmp.reg, 8);
            ac.b.mov_r_ro(tmp.reg, tmp.reg);
            ac.b.mul_r_r(tmp.reg, index.reg);

            // tmp = tmp + base + 8 + 8
            ac.b.add_r_i(tmp.reg, 16);
            ac.b.add_r_r(tmp.reg, base.reg);

            // update
            derefer(store, tmp);

            index.free();
            tmp.free();
            break;
        }
        case NodeType.LocalReturnExpr: {
            const x = e as A.LocalReturnExpr;
            emitExpr(ac, store, block, x.expr);
            break;
        }
        case NodeType.IfExpr: {
            const x = e as A.IfExpr;

            const r = ac.tmp();
            emitExpr(ac, r, block, x.condition);
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
            emitExpr(ac, store, block, x.expr);
            break;
        }
        case NodeType.VoidExpr: {
            break;
        }
        case NodeType.ReferenceExpr: {
            const x = e as A.ReferenceExpr;
            const old = store.isValue;
            store.isValue = false;
            emitExpr(ac, store, block, x.expr);
            store.isValue = old;
            break;
        }
        case NodeType.BlockExpr: {
            const x = e as A.BlockExpr;
            emitBlock(ac, store, x);
            break;
        }
        case NodeType.GroupExpr: {
            const x = e as A.GroupExpr;
            emitExpr(ac, store, block, x.expr);
            break;
        }
        default: Errors.raiseDebug(NodeType[e.nodeType]);
    }
}

function bindTypeInfo(ac: Allocator, store: Store, block: A.BlockExpr, v: P.Variable) {
    //Errors.ASSERT(v.type.native.bits !== 0, `${v.id}:${v.type.id}`, v.loc);
    const ss = newStructState();
    computeStructInfo(ss, block, v, v.id);
    for (const [k, i] of Object.entries(ss.map)) {
        const vx = ss.xs[i]
        Logger.debug2(`${v.id}.${k} = ${vx.offset}:${vx.size}`);
    }
    return ac.alloc(v, ss);
}

function emitStmt(ac: Allocator, store: Store, block: A.BlockExpr, s: Stmt) {
    Logger.debug("##===========##");
    switch (s.nodeType) {
        case NodeType.VarInitStmt: {
            const x = s as A.VarInitStmt;
            const r0 = ac.from("r0");
            emitExpr(ac, r0, block, x.expr);
            const r = bindTypeInfo(ac, store, block, x.var);
            r.write_reg(r0);
            break;
        }
        case NodeType.VarAssnStmt: {
            const x = s as A.VarAssnStmt;
            const r0 = ac.from("r0");
            r0.isRHS = true;
            emitExpr(ac, r0, block, x.rhs);
            r0.isWrite = false;
            r0.isRHS = false;
            emitExpr(ac, r0, block, x.lhs);
            break;
        }
        case NodeType.ReturnStmt: {
            const x = s as A.ReturnStmt;
            emitExpr(ac, store, block, x.expr);
            ac.b.ret();
            break;
        }
        case NodeType.ExprStmt: {
            const x = s as A.ExprStmt;
            emitExpr(ac, store, block, x.expr);
            break;
        }
        case NodeType.ForStmt: {
            const x = s as A.ForStmt;

            if (x.init) emitStmt(ac, store, block, x.init);

            const startOffset = ac.b.codeOffset();
            const gotoStart = `start-${startOffset}`;
            let gotoEnd = ";"

            if (x.condition) {
                const r = ac.tmp();
                emitExpr(ac, r, block, x.condition);
                ac.b.cmp_r_i(r.reg, 1);
                gotoEnd = `end-${ac.b.codeOffset()}`;
                ac.b.jnz(gotoEnd);
                r.free();
            }

            emitBlock(ac, store, x.body);
            if (x.update) emitStmt(ac, store, block, x.update);
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
    const scratch = ac.tmp();
    if (scratch.reg !== "r0") Errors.raiseDebug();
    f.params.forEach(x => bindTypeInfo(ac, scratch, f.body, x));
    emitBlock(ac, scratch, f.body);
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