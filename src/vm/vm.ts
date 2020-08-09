/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
    Errors,
    Logger,
    int,
    Int,
} from "../util/mod.ts";
import {
    VmOperation
} from "./mod.internal.ts";

export default class Vm {
    public static readonly SEGMENT_SIZE = 1024*32;
    private ip: int;
    private hp: int; // heap pointer
    private sp: int; // stack pointer
    private readonly registers = [
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
        0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
    ];
    private readonly FLAGS = {
        ZF: 0n,
        SF: 0n,
        OF: 0n,
    };
    private readonly memory: Uint8Array;
    private readonly dv: DataView;
    private readonly enc: TextEncoder;
    private readonly dec: TextDecoder;

    private constructor(private readonly imports: int) {
        this.memory = new Uint8Array(Vm.SEGMENT_SIZE*8);
        this.dv = new DataView(this.memory.buffer);
        this.enc = new TextEncoder();
        this.dec = new TextDecoder();
        this.ip = 0n;
        this.hp = Int(Vm.SEGMENT_SIZE*4);
        this.sp = Int(this.memory.length - 8);
    }

    static build(imports: int) {
        return new Vm(imports);
    }

    private check_offset(offset: int) {
        if (offset >= Int(this.memory.length)) {
         Errors.raiseDebug(`offset err: ${offset} >= ${this.memory.length}`);
        }
    }

    private mem_alloc(size: int) {
        if (!size) Errors.raiseDebug();
        const offset = this.hp;
        this.check_offset(offset);
        this.check_offset(offset + size - 1n);
        this.hp += size;
        return offset;
    }

    private mem_free(p: int) {

    }

    private read_u8_from_ptr(p: int) {
        this.check_offset(p);
        return this.dv.getUint8(Number(p));
    }

    private read_u8(offset?: int) {
        if (offset) {
            return this.read_u8_from_ptr(offset);
        }
        else {
            const x = this.read_u8_from_ptr(this.ip);
            this.ip += 1n;
            return x;
        }
    }

    private read_u16(offset?: int) {
        if (offset) {
            return this.read_u16_from_ptr(offset);
        }
        else {
            const x = this.read_u16_from_ptr(this.ip);
            this.ip += 2n;
            return x;
        }
    }

    private read_u16_from_ptr(p: int) {
        this.check_offset(p);
        return this.dv.getUint16(Number(p));
    }

    private read_u32(offset?: int) {
        if (offset) {
            return this.read_u32_from_ptr(offset);
        }
        else {
            const x = this.read_u32_from_ptr(this.ip);
            this.ip += 4n;
            return x;
        }
    }

    private read_u32_from_ptr(p: int) {
        this.check_offset(p);
        return this.dv.getUint32(Number(p));
    }

    private read_u64(offset?: int) {
        if (offset) {
            return this.read_u64_from_ptr(offset);
        }
        else {
            const x = this.read_u64_from_ptr(this.ip);
            this.ip += 8n;
            return x;
        }
    }

    private read_u64_from_ptr(p: int) {
        this.check_offset(p);
        const upper = Int(this.dv.getUint32(Number(p)));
        const lower = Int(this.dv.getUint32(Number(p + 4n)));

        return (upper * (2n ** 32n)) + lower;
    }

    private write_str(x: string) {
        const xs = this.enc.encode(x);
        const offset = this.mem_alloc(Int(xs.byteLength + 8));
        let ptr = Number(offset);

        this.write_u64(Int(ptr), Int(xs.length));
        ptr += 8;
        for (let i = 0; i < xs.length; i += 1) {
            this.dv.setUint8(ptr, xs[i]);
            ptr += 1;
        }
        return offset;
    }

    private read_str(offset: int) {
        let ip = offset;

        const len = this.read_u64(ip);
        ip += 8n;
        this.check_offset(ip + len);
        const xs = [];
        for (let i = 0; i < len; i += 1) {+
            this.check_offset(ip);
            const x = this.dv.getUint8(Number(ip));
            xs.push(x);
            ip += 1n;
        }

        return this.dec.decode(new Uint8Array(xs));
    }

    private write_u8(offset: int, x: int) {
        this.check_offset(offset);
        this.dv.setUint8(Number(offset), Number(x));
    }

    private write_u16(offset: int, x: int) {
        this.check_offset(offset);
        this.dv.setUint16(Number(offset), Number(x));
    }

    private write_u32(offset: int, x: int) {
        this.check_offset(offset);
        this.dv.setUint32(Number(offset), Number(x));
    }

    private write_u64(offset: int, x: int) {
        this.check_offset(offset);
        this.dv.setBigUint64(Number(offset), x);
    }

    private push(n: int) {
        this.dv.setBigUint64(Number(this.sp), n);
        this.sp -= 8n;
    }

    private pop() {
        this.sp += 8n;
        return this.read_u64_from_ptr(this.sp);
    }

    private read_from_offset(ins: number, offset: int) {
        switch (ins) {
            case 0: return Int(this.read_u8(offset));
            case 1: return Int(this.read_u16(offset));
            case 2: return Int(this.read_u32(offset));
            case 3: return this.read_u64(offset);
            default: Errors.notImplemented();
        }
    }

    private write_to_offset(ins: number, offset: int, v: int) {
        switch (ins) {
            case 0: this.write_u8(offset, v); break;
            case 1: this.write_u16(offset, v); break;
            case 2: this.write_u32(offset, v); break;
            case 3: this.write_u64(offset, v); break;
            default: Errors.notImplemented();
        }
    }

    private init(code: Uint8Array) {
        if (code.length >= this.memory.length) Errors.raiseDebug();

        for (let i = 0; i < code.length; i += 1) {
            this.memory[i] = code[i];
        }
    }

    private parse_r_r(ins?: string) {
        const rr = this.read_u8();
        const rd = (rr >>> 4) & 0x0F;
        const rs = rr & 0x0F;
        if (ins) Logger.debug(`${ins} r${rd}, r${rs} // r${rd} ! ${this.hex(this.registers[Number(rs)])}`);
        return [rd, rs];
    }

    private parse_r_i() {
        const rr = this.read_u8();
        const r = (rr >>> 4) & 0x0F;
        const x = this.read_u64();
        return [Int(r), x];
    }

    private parse_r() {
        const rr = this.read_u8();
        const r = (rr >>> 4) & 0x0F;
        return Int(r);
    }

    private updateFlags(rd: int|number, isReg: boolean = true) {
        const v = isReg ? this.registers[Number(rd)] : rd;
        this.FLAGS.ZF = v === 0n ? 1n : 0n;
        this.FLAGS.SF = v < 0n ? 1n : 0n;
        this.FLAGS.OF = 0n;
    }

    private set(rd: int|number, flag: boolean) {
        this.registers[Number(rd)] = flag ? 1n : 0n;
    }

    hex(n: number|int) {
        return `0x${Number(n).toString(16)}`;
    }

    hexRange(label: string, a: number|int, b: number|int) {
        return `${label}\t\t${this.hex(a)}-${this.hex(b)}`;
    }

    exec(code: Uint8Array, args: string[]) {
        this.init(code);
        Logger.debug2(this.hexRange("CODE     ", Vm.SEGMENT_SIZE * 0, Vm.SEGMENT_SIZE * 1));
        Logger.debug2(this.hexRange("IMPORTS  ", Vm.SEGMENT_SIZE * 1, Vm.SEGMENT_SIZE * 2));
        Logger.debug2(this.hexRange("IMMUTABLE", Vm.SEGMENT_SIZE * 2, Vm.SEGMENT_SIZE * 3));
        Logger.debug2(this.hexRange("MUTABLE  ", Vm.SEGMENT_SIZE * 3, Vm.SEGMENT_SIZE * 4));
        Logger.debug2(this.hexRange("HEAP     ", Vm.SEGMENT_SIZE * 4, this.memory.byteLength));

        const offset = this.mem_alloc(Int((args.length * 8) + 8 + 8));
        let ptr = offset;
        this.write_u64(ptr, Int(args.length));
        ptr += 8n;
        this.write_u64(ptr, 8n);
        ptr += 8n;
        for (let i = 0; i < args.length; i += 1) {
            const x = this.write_str(args[i]);
            this.write_u64(ptr, x);
            ptr += 8n;
        }
        this.registers[1] = offset;
        this.push(0n);
        while (true) {
            const ins = this.read_u8();
            switch (ins) {
                case VmOperation.ADD_R_R: {
                    const [rd, rs] = this.parse_r_r("ADD");
                    this.registers[Number(rd)] += this.registers[rs];
                    this.updateFlags(rd);
                    break;
                }
                case VmOperation.ADD_R_I: {
                    const [rd, x] = this.parse_r_i();
                    this.registers[Number(rd)] += x;
                    Logger.debug(`ADD r${rd}, ${x}`);
                    this.updateFlags(rd);
                    break;
                }
                case VmOperation.SUB_R_R: {
                    const [rd, rs] = this.parse_r_r("SUB");
                    this.registers[Number(rd)] -= this.registers[rs];
                    this.updateFlags(rd);
                    break;
                }
                case VmOperation.SUB_R_I: {
                    const [rd, x] = this.parse_r_i();
                    this.registers[Number(rd)] -= x;
                    Logger.debug(`SUB r${rd}, ${x}`);
                    this.updateFlags(rd);
                    break;
                }
                case VmOperation.MUL_R_R: {
                    const [rd, rs] = this.parse_r_r("MUL");
                    this.registers[Number(rd)] *= this.registers[rs];
                    break;
                }
                case VmOperation.MUL_R_I: {
                    const [rd, x] = this.parse_r_i();
                    this.registers[Number(rd)] *= x;
                    Logger.debug(`MUL r${rd}, ${x}`);
                    break;
                }
                case VmOperation.DIV_R_R: {
                    const [rd, rs] = this.parse_r_r("DIV");
                    this.registers[Number(rd)] /= this.registers[rs];
                    break;
                }
                case VmOperation.DIV_R_I: {
                    const [rd, x] = this.parse_r_i();
                    this.registers[Number(rd)] /= x;
                    Logger.debug(`DIV r${rd}, ${x}`);
                    break;
                }
                case VmOperation.MOD_R_R: {
                    const [rd, rs] = this.parse_r_r("MOD");
                    this.registers[Number(rd)] %= this.registers[rs];
                    break;
                }
                case VmOperation.MOD_R_I: {
                    const [rd, x] = this.parse_r_i();
                    this.registers[Number(rd)] %= x;
                    Logger.debug(`MOD r${rd}, ${x}`);
                    break;
                }
                case VmOperation.MOV_R_R: {
                    const [rd, rs] = this.parse_r_r("MOV");
                    this.registers[Number(rd)] = this.registers[rs];
                    break;
                }
                case VmOperation.MOV_R_I: {
                    const [rd, x] = this.parse_r_i();
                    this.registers[Number(rd)] = x;
                    Logger.debug(`MOV r${rd}, 0x${Number(x).toString(16)}`);
                    break;
                }
                case VmOperation.MOV_R_RO_1:
                case VmOperation.MOV_R_RO_2:
                case VmOperation.MOV_R_RO_4:
                case VmOperation.MOV_R_RO_8: {
                    const [rd, rs] = this.parse_r_r();
                    const offset = this.registers[rs];
                    const n = this.read_from_offset(ins - VmOperation.MOV_R_RO_1, offset);
                    this.registers[Number(rd)] = n;
                    Logger.debug(`MOV r${rd}, [r${rs}] // 0x${Number(n).toString(16)} = [0x${Number(offset).toString(16)}]`);
                    break;
                }
                case VmOperation.MOV_RO_R_1:
                case VmOperation.MOV_RO_R_2:
                case VmOperation.MOV_RO_R_4:
                case VmOperation.MOV_RO_R_8: {
                    const [rd, rs] = this.parse_r_r();
                    const offset = this.registers[rd];
                    const n = this.registers[Number(rs)];
                    this.write_to_offset(ins - VmOperation.MOV_RO_R_1, offset, n);
                    Logger.debug(`MOV [r${rd}], r${rs} // [0x${Number(offset).toString(16)}] = 0x${Number(n).toString(16)}`);
                    break;
                }
                case VmOperation.MOV_R_M1:
                case VmOperation.MOV_R_M2:
                case VmOperation.MOV_R_M4:
                case VmOperation.MOV_R_M8: {
                    const [rd, offset] = this.parse_r_i();
                    this.registers[Number(rd)] = this.read_from_offset(ins - VmOperation.MOV_R_M1, offset);
                    Logger.debug(`MOV r${rd}, [0x${Number(offset).toString(16)}]`);
                    break;
                }
                case VmOperation.MOV_M1_R:
                case VmOperation.MOV_M2_R:
                case VmOperation.MOV_M4_R:
                case VmOperation.MOV_M8_R: {
                    const [rs, offset] = this.parse_r_i();
                    this.write_to_offset(ins - VmOperation.MOV_M1_R, offset, this.registers[Number(rs)]);
                    Logger.debug(`MOV [0x${Number(offset).toString(16)}], r${rs}`);
                    break;
                }
                case VmOperation.CMP_R_R: {
                    const [rd, rs] = this.parse_r_r("CMP");
                    const v = this.registers[Number(rd)] - this.registers[rs];
                    this.updateFlags(v, false);
                    Logger.debug(`ZF: ${this.FLAGS.ZF}`);
                    break;
                }
                case VmOperation.CMP_R_I: {
                    const [rs, x] = this.parse_r_i();
                    const v = this.registers[Number(rs)] - x;
                    this.updateFlags(v, false);
                    Logger.debug(`CMP r${rs}, ${x}`);
                    Logger.debug(`ZF: ${this.FLAGS.ZF}`);
                    break;
                }
                case VmOperation.AND_R_R: {
                    const [rd, rs] = this.parse_r_r("AND");
                    this.registers[Number(rd)] = this.registers[Number(rd)] & this.registers[rs];
                    this.updateFlags(rd);
                    break;
                }
                case VmOperation.OR_R_R: {
                    const [rd, rs] = this.parse_r_r("OR");
                    this.registers[Number(rd)] = this.registers[Number(rd)] | this.registers[rs];
                    this.updateFlags(rd);
                    break;
                }
                case VmOperation.SET_E: {
                    const rs = this.parse_r();
                    Logger.debug(`SET_E r${rs}`);
                    this.set(rs, !!this.FLAGS.ZF);
                    break;
                }
                case VmOperation.SET_NE: {
                    const rs = this.parse_r();
                    Logger.debug(`SET_NE r${rs}`);
                    this.set(rs, !this.FLAGS.ZF);
                    break;
                }
                case VmOperation.SET_LT: {
                    const rs = this.parse_r();
                    Logger.debug(`SET_LT r${rs}`);
                    this.set(rs, this.FLAGS.SF != this.FLAGS.OF);
                    break;
                }
                case VmOperation.SET_LE: {
                    const rs = this.parse_r();
                    Logger.debug(`SET_LE r${rs}`);
                    this.set(rs, !!this.FLAGS.ZF || (this.FLAGS.SF != this.FLAGS.OF));
                    break;
                }
                case VmOperation.SET_GE: {
                    const rs = this.parse_r();
                    Logger.debug(`SET_GE r${rs}`);
                    this.set(rs, this.FLAGS.SF == this.FLAGS.OF);
                    break;
                }
                case VmOperation.SET_GT: {
                    const rs = this.parse_r();
                    Logger.debug(`SET_GT r${rs}`);
                    this.set(rs, !this.FLAGS.ZF && (this.FLAGS.SF == this.FLAGS.OF));
                    break;
                }
                case VmOperation.PUSH: {
                    const rs = this.parse_r();
                    Logger.debug2(`PUSH r${rs}`);
                    this.push(this.registers[Number(rs)]);
                    break;
                }
                case VmOperation.POP: {
                    const rd = this.parse_r();
                    Logger.debug2(`POP r${rd}`);
                    this.registers[Number(rd)] = this.pop();
                    break;
                }
                case VmOperation.BITWISE_NOT: {
                    const rs = this.parse_r();
                    Logger.debug2(`NOT r${rs}`);
                    this.registers[Number(rs)] = (~this.registers[Number(rs)]) & 0xffff_ffff_ffff_ffffn;
                    break;
                }
                case VmOperation.LOGICAL_NOT: {
                    const rs = this.parse_r();
                    Logger.debug2(`NOT r${rs}`);
                    this.registers[Number(rs)] = this.registers[Number(rs)] ? 0n : 1n;
                    break;
                }
                case VmOperation.CALL: {
                    const offset = this.read_u64();
                    Logger.debug(`CALL 0x${Number(offset).toString(16)}`);
                    if (offset >= this.imports) {
                        const fn = this.read_str(offset);
                        const p0 = this.registers[1];
                        switch (fn) {
                            case "sys-exit($Int64)": {
                                Deno.exit(Number(p0));
                                break;
                            }
                            case "sys-println($String)": {
                                const str = this.read_str(p0);
                                console.log(`${str}`);
                                break;
                            }
                            case "sys-println($Int64)": {
                                console.log(`${p0}`);
                                break;
                            }
                            case "sys-println($Bool)": {
                                console.log(`${p0 === 1n}`);
                                break;
                            }
                            case "sys-new($Int64)": {
                                this.registers[0] = this.mem_alloc(p0);
                                break;
                            }
                            case "sys-free($Int64)": {
                                this.mem_free(p0);
                                break;
                            }
                            case "sys-size($Pointer)": {
                                this.registers[0] = this.read_u64(p0);
                                break;
                            }
                            default: Errors.raiseVmError(`Unknown foreign function: ${fn}`);
                        }
                    }
                    else {
                        this.push(this.ip);
                        this.ip = offset;
                    }
                    break;
                }
                case VmOperation.JMP: {
                    const offset = this.read_u64();
                    Logger.debug(`JMP ${offset}`);
                    this.ip = offset;
                    break;
                }
                case VmOperation.JZ: {
                    const offset = this.read_u64();
                    if (!!this.FLAGS.ZF) {
                        Logger.debug(`JZ ${offset}`);
                        this.ip = offset;
                    }
                    break;
                }
                case VmOperation.JNZ: {
                    const offset = this.read_u64();
                    if (!this.FLAGS.ZF) {
                        Logger.debug(`JNZ ${offset}`);
                        this.ip = offset;
                    }
                    break;
                }
                case VmOperation.RET: {
                    Logger.debug("RET");
                    this.ip = this.pop();
                    if (this.ip === 0n) {
                        Logger.debug("DONE");
                        return;
                    }
                    break;
                }
                default: Errors.raiseDebug(""+ins);
            }
        }
    }
}