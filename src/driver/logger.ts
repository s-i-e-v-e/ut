/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { OS } from "./mod.ts";

enum LogLevel {
    NONE,
    INFO,
    DEBUG1,
    DEBUG2,
}

export class Logger {
    private static level = LogLevel.NONE;

    static setLevel(level: number) {
        this.level = level as LogLevel;
    }

    static info(msg: string) {
        if (this.level < LogLevel.INFO) return;
        console.log(msg);
    }

    static debug(msg: string) {
        if (this.level < LogLevel.DEBUG1) return;
        console.log(msg);
    }

    static debug2(msg: string) {
        if (this.level < LogLevel.DEBUG1) return;
        console.log(msg);
    }

    static error(e: Error) {
        return OS.panic(e.message);
    }
}