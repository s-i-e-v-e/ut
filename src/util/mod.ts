/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import Logger from "./logger.ts";
import Errors from "./errors.ts";
import OS from "./os.ts";

export default class Ut {
    static logger = Logger;
    static errors = Errors;
    static os = OS;
};