/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {Errors, Int, int} from "./mod.ts";

export default class ByteBuffer {
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

    private check_offset(offset: int|number) {
        if (offset >= Int(this.dv.byteLength)) {
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

    write_u64(x: int|number) {
        const n = this.write_u64_at(x, this._offset);
        this._offset += 8;
        return n;
    }

    write_u64_at(x: int|number, offset: number) {
        this.check_offset(offset);
        this.dv.setBigUint64(offset, Int(x));
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