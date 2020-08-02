/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    Dictionary,
    Errors,
    Logger,
} from "../util/mod.ts";

import {
    VmOperation,
} from "./mod.internal.ts";
import {
    registers,
} from "./mod.ts";
import Vm from "./vm.ts";

export class ByteBuffer {
    private readonly enc: TextEncoder;
    private readonly xs: Uint8Array;
    private readonly dv: DataView;
    private _offset: number;

    private constructor(size: number) {
        this.enc = new TextEncoder();
        this.xs = new Uint8Array(size);
        this.dv = new DataView(this.xs.buffer);
        this._offset = 0;
    }

    static build(size: number) {
        return new ByteBuffer(size);
    }

    set_offset(offs: number)  {
        this._offset = offs;
    }

    offset() {
        return this._offset;
    }

    get_u8(offs: number) {
        return this.dv.getUint8(offs);
    }

    private check_offset(offset: bigint|number) {
        if (offset >= BigInt(this.dv.byteLength)) {
            Errors.raiseDebug(`offset err: ${offset} >=${this.dv.byteLength}`);
        }
    }

    write_str(x: string) {
        const xs = this.enc.encode(x);
        this.write_u64(xs.length);
        for (let i = 0; i < xs.length; i += 1) {
            this.dv.setUint8(this._offset, xs[i]);
            this._offset += 1;
        }
        return xs.length;
    }

    write_u8(x: number) {
        if (x > 255) Errors.raiseDebug();
        this.check_offset(this._offset);
        this.dv.setUint8(this._offset, x);
        this._offset += 1;
        return 1;
    }

    write_u64(x: bigint|number) {
        const n = this.write_u64_at(x, this._offset);
        this._offset += 8;
        return n;
    }

    write_u64_at(x: bigint|number, offset: number) {
        this.check_offset(offset);
        this.dv.setBigUint64(offset, BigInt(x));
        return 8;
    }

    write(xs: Uint8Array) {
        for (let i = 0; i < xs.length; i += 1) {
            this.check_offset(this._offset);
            this.dv.setUint8(this._offset, xs[i]);
            this._offset += 1;
        }
    }

    asBytes() {
        return this.xs;
    }
}

interface Reloc {
    offset: number;
    id: string;
}

function checkRegister(r: string) {
    if (registers[r] === undefined) Errors.raiseDebug(`Unknown register: ${r}`);
}

export class VmCodeBuilder {
    private static readonly SEGMENT_SIZE = Vm.SEGMENT_SIZE;
    private static readonly CS_BASE = VmCodeBuilder.SEGMENT_SIZE*0;
    private static readonly IMPORTS_BASE = VmCodeBuilder.SEGMENT_SIZE*1;
    private static readonly RDS_BASE = VmCodeBuilder.SEGMENT_SIZE*2;
    private static readonly DS_BASE = VmCodeBuilder.SEGMENT_SIZE*3;

    private readonly cs: ByteBuffer
    private readonly ds: ByteBuffer;
    private readonly rds: ByteBuffer;
    private readonly imports: ByteBuffer;
    private readonly labels: Dictionary<number>;
    private readonly reloc: Array<Reloc>;
    public readonly importsOffset: bigint;
    private readonly internedStrings: Dictionary<number>;

    private constructor() {
        this.importsOffset = BigInt(VmCodeBuilder.IMPORTS_BASE);
        this.cs = ByteBuffer.build(VmCodeBuilder.SEGMENT_SIZE);
        this.imports = ByteBuffer.build(VmCodeBuilder.SEGMENT_SIZE);
        this.rds = ByteBuffer.build(VmCodeBuilder.SEGMENT_SIZE);
        this.ds = ByteBuffer.build(VmCodeBuilder.SEGMENT_SIZE);
        this.labels = {};
        this.reloc = [];
        this.internedStrings = {};
    }

    static build() {
        return new VmCodeBuilder();
    }

    codeOffset() {
        return this.cs.offset();
    }

    mapCodeOffset(id: string, offset: number) {
        this.labels[id] = offset;
    }

    addForeignFunction(id: string) {
        const offs = this.imports.offset();
        this.imports.write_str(id);
        this.labels[id] = VmCodeBuilder.IMPORTS_BASE + offs;
        Logger.debug(`addForeignFunction:: ${id} => ${this.labels[id]}`);
    }

    private padding() {
        while ((this.cs.offset() % 256) !== 0) {
            this.cs.write_u8(0xCC);
        }
    }

    startFunction(id: string) {
        this.padding();
        this.labels[id] = this.cs.offset();
        Logger.debug(`startFunction:: ${id} => ${this.labels[id]}`);
    }

    private putStr(x: string) {
        if (!this.internedStrings[x]) {
            const offs = this.rds.offset();
            this.rds.write_str(x);
            this.internedStrings[x] = VmCodeBuilder.RDS_BASE + offs;
        }
        return this.internedStrings[x];
    }

    private do_ins(op: number) {
        this.cs.write_u8(op);
    }

    heapStore(xs: Uint8Array) {
        const offs = this.ds.offset();
        this.ds.write(xs);
        return VmCodeBuilder.DS_BASE+offs;
    }

    private write_r_r(rd: string, rs: string, op: VmOperation) {
        this.do_ins(op);
        const a = registers[rd];
        const b = registers[rs];
        this.cs.write_u8(a << 4 | b);
    }

    private write_r_i(rd: string, n: number, op: VmOperation) {
        this.do_ins(op);
        const a = registers[rd];
        this.cs.write_u8(a << 4 | 0);
        this.cs.write_u64(n);
    }

    private write_r(rd: string, op: VmOperation) {
        this.do_ins(op);
        const a = registers[rd];
        this.cs.write_u8(a << 4 | 0);
    }

    mov_r_r(rd: string, rs: string) {
        checkRegister(rd);
        checkRegister(rs);
        if (rd === rs) return;
        this.do_ins(VmOperation.MOV_R_R);
        const a = registers[rd];
        const b = registers[rs];
        this.cs.write_u8(a << 4 | b);
        Logger.debug(`MOV ${rd}, ${rs}`);
    }

    mov_r_i(rd: string, n: bigint) {
        checkRegister(rd);
        this.do_ins(VmOperation.MOV_R_I);
        const a = registers[rd];
        this.cs.write_u8(a << 4 | 0);
        this.cs.write_u64(n);
        Logger.debug(`MOV ${rd}, ${n}`);
    }

    mov_r_str(rd: string, x: string) {
        checkRegister(rd);
        const offset = this.putStr(x);
        this.mov_r_i(rd, BigInt(offset));
    }

    mov_m_r(offset: number, rs: string) {
        checkRegister(rs);
        this.do_ins(VmOperation.MOV_M_R);
        const a = registers[rs];
        this.cs.write_u8(a << 4 | 0);
        this.cs.write_u64(offset);
        Logger.debug(`MOV [${offset}], ${rs}`);
    }

    mov_r_m(rd: string, offset: number) {
        checkRegister(rd);
        this.do_ins(VmOperation.MOV_R_M);
        const a = registers[rd];
        this.cs.write_u8(a << 4 | 0);
        this.cs.write_u64(offset);
        Logger.debug(`MOV ${rd}, [${offset}]`);
    }

    mov_r_ro(rd: string, rs: string) {
        checkRegister(rd);
        checkRegister(rs);
        this.do_ins(VmOperation.MOV_R_RO);
        const a = registers[rd];
        const b = registers[rs];
        this.cs.write_u8(a << 4 | b);
        Logger.debug(`MOV ${rd}, [${rs}]`);
    }

    mov_ro_r(rd: string, rs: string) {
        checkRegister(rd);
        checkRegister(rs);
        this.do_ins(VmOperation.MOV_RO_R);
        const a = registers[rd];
        const b = registers[rs];
        this.cs.write_u8(a << 4 | b);
        Logger.debug(`MOV [${rd}], ${rs}`);
    }

    push_i(x: number) {
        this.do_ins(VmOperation.PUSH_I);
        this.cs.write_u64(x);
    }

    push_r(rs: string) {
        checkRegister(rs);
        this.do_ins(VmOperation.PUSH);
        const a = registers[rs];
        this.cs.write_u8(a << 4 | 0);
    }

    pop_r(rd: string) {
        checkRegister(rd);
        this.do_ins(VmOperation.POP);
        const a = registers[rd];
        this.cs.write_u8(a << 4 | 0);
    }

    private goto(op: VmOperation, id: string, map: Dictionary<number>) {
        this.do_ins(op);
        let offset;
        Logger.debug(`goto:: ${id} => ${map[id]}`);
        if (map[id] !== undefined) {
            offset = map[id]; // location of function/label
        }
        else {
            this.reloc.push({
                id: id,
                offset: this.cs.offset(),
            });
            offset = 0xFFFFFFFFFFFFFFFF;
        }
        this.cs.write_u64(offset);
    }

    jz(id: string) {
        this.goto(VmOperation.JZ, id, this.labels);
        Logger.debug(`JZ ${id}`);
    }

    jnz(id: string) {
        this.goto(VmOperation.JNZ, id, this.labels);
        Logger.debug(`JNZ ${id}`);
    }

    jmp(id: string) {
        this.goto(VmOperation.JMP, id, this.labels);
        Logger.debug(`JMP ${id}`);
    }

    call(id: string) {
        this.goto(VmOperation.CALL, id, this.labels);
        Logger.debug(`CALL ${id}`);
    }

    ret() {
        this.do_ins(VmOperation.RET);
        Logger.debug(`RET`);
    }

    mul_r_r(rd: string, rs: string) {
        checkRegister(rd);
        checkRegister(rs);
        this.write_r_r(rd, rs, VmOperation.MUL_R_R);
        Logger.debug(`MUL ${rd}, ${rs}`);
    }

    div_r_r(rd: string, rs: string) {
        checkRegister(rd);
        checkRegister(rs);
        this.write_r_r(rd, rs, VmOperation.DIV_R_R);
        Logger.debug(`DIV ${rd}, ${rs}`);
    }

    mod_r_r(rd: string, rs: string) {
        checkRegister(rd);
        checkRegister(rs);
        this.write_r_r(rd, rs, VmOperation.MOD_R_R);
        Logger.debug(`MOD ${rd}, ${rs}`);
    }

    add_r_r(rd: string, rs: string) {
        checkRegister(rd);
        checkRegister(rs);
        this.write_r_r(rd, rs, VmOperation.ADD_R_R);
        Logger.debug(`ADD ${rd}, ${rs}`);
    }

    sub_r_r(rd: string, rs: string) {
        checkRegister(rd);
        checkRegister(rs);
        this.write_r_r(rd, rs, VmOperation.SUB_R_R);
        Logger.debug(`SUB ${rd}, ${rs}`);
    }

    mul_r_i(rd: string, n: number) {
        checkRegister(rd);
        this.write_r_i(rd, n, VmOperation.MUL_R_I);
        Logger.debug(`MUL ${rd}, ${n}`);
    }

    div_r_i(rd: string, n: number) {
        checkRegister(rd);
        this.write_r_i(rd, n, VmOperation.DIV_R_I);
        Logger.debug(`DIV ${rd}, ${n}`);
    }

    mod_r_i(rd: string, n: number) {
        checkRegister(rd);
        this.write_r_i(rd, n, VmOperation.MOD_R_I);
        Logger.debug(`MOD ${rd}, ${n}`);
    }

    add_r_i(rd: string, n: number) {
        checkRegister(rd);
        this.write_r_i(rd, n, VmOperation.ADD_R_I);
        Logger.debug(`ADD ${rd}, ${n}`);
    }

    sub_r_i(rd: string, n: number) {
        checkRegister(rd);
        this.write_r_i(rd, n, VmOperation.SUB_R_I);
        Logger.debug(`SUB ${rd}, ${n}`);
    }

    cmp_r_i(rs: string, n: number) {
        checkRegister(rs);
        this.write_r_i(rs, n, VmOperation.CMP_R_I);
        Logger.debug(`CMP ${rs}, ${n}`);
    }

    cmp_r_r(rd: string, rs: string) {
        checkRegister(rd);
        checkRegister(rs);
        this.write_r_r(rd, rs, VmOperation.CMP_R_R);
        Logger.debug(`CMP ${rd}, ${rs}`);
    }

    and_r_r(rd: string, rs: string) {
        checkRegister(rd);
        checkRegister(rs);
        this.write_r_r(rd, rs, VmOperation.AND_R_R);
        Logger.debug(`AND ${rd}, ${rs}`);
    }

    or_r_r(rd: string, rs: string) {
        checkRegister(rd);
        checkRegister(rs);
        this.write_r_r(rd, rs, VmOperation.OR_R_R);
        Logger.debug(`OR ${rd}, ${rs}`);
    }

    not(rd: string) {
        checkRegister(rd);
        this.write_r(rd, VmOperation.NOT);
        Logger.debug(`NOT ${rd}`);
    }

    sete(rd: string) {
        checkRegister(rd);
        this.write_r(rd, VmOperation.SET_E);
        Logger.debug(`SETE ${rd}`);
    }

    setne(rd: string) {
        checkRegister(rd);
        this.write_r(rd, VmOperation.SET_NE);
        Logger.debug(`SETNE ${rd}`);
    }

    setlt(rd: string) {
        checkRegister(rd);
        this.write_r(rd, VmOperation.SET_LT);
        Logger.debug(`SETLT ${rd}`);
    }

    setle(rd: string) {
        checkRegister(rd);
        this.write_r(rd, VmOperation.SET_LE);
        Logger.debug(`SETLE ${rd}`);
    }

    setgt(rd: string) {
        checkRegister(rd);
        this.write_r(rd, VmOperation.SET_GT);
        Logger.debug(`SETGT ${rd}`);
    }

    setge(rd: string) {
        checkRegister(rd);
        this.write_r(rd, VmOperation.SET_GE);
        Logger.debug(`SETGE ${rd}`);
    }

    asBytes() {
        this.padding();

        // finalize reloc
        for (const r of this.reloc) {
            const offset = this.labels[r.id];
            const dest = r.offset;
            this.cs.write_u64_at(offset, dest);
            Logger.debug(`reloc::${r.id}:${offset} @ ${dest}`)
        }

        const xs = new Uint8Array(VmCodeBuilder.CS_BASE+VmCodeBuilder.IMPORTS_BASE+VmCodeBuilder.RDS_BASE+VmCodeBuilder.DS_BASE);
        xs.set(this.cs.asBytes(), VmCodeBuilder.CS_BASE);
        xs.set(this.imports.asBytes(), VmCodeBuilder.IMPORTS_BASE);
        xs.set(this.rds.asBytes(), VmCodeBuilder.RDS_BASE);
        xs.set(this.ds.asBytes(), VmCodeBuilder.DS_BASE);
        return xs;
    }
}