/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { OS } from "./mod.ts";

export enum LogLevel {
    NONE,
    INFO,
    DEBUG1,
    DEBUG2,
}

export class Logger {
    private static level = LogLevel.NONE;

    static setLevel(level: LogLevel) {
        this.level = level;
    }

    static info(msg: string) {
        if (this.level < LogLevel.INFO) return;
        console.log(msg);
    }

    static error(e: Error) {
        return OS.panic(e.message);
    }

    static debug(msg: string) {
        if (this.level < LogLevel.DEBUG1) return;
        console.log(msg);
    }

    static debug2(msg: string) {
        if (this.level < LogLevel.DEBUG1) return;
        console.log(msg);
    }
}