/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
export {SourceFile, OS} from "./os.ts";
export { Logger } from "./logger.ts";
export { Errors } from "./errors.ts";
export { run } from "./runner.ts";

export interface Config {
    logLevel: number,
    dump: boolean,
    base: string,
}

export interface Command {
    id: string,
    args: string[],
}