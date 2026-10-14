/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as documentLoader from "../documentLoader.js";
import type * as http from "../http.js";
import type * as lib_answerRules from "../lib/answerRules.js";
import type * as lib_conversation from "../lib/conversation.js";
import type * as lib_serviceRetry from "../lib/serviceRetry.js";
import type * as questions from "../questions.js";
import type * as storageCleanup from "../storageCleanup.js";
import type * as unansweredQuestions from "../unansweredQuestions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  documentLoader: typeof documentLoader;
  http: typeof http;
  "lib/answerRules": typeof lib_answerRules;
  "lib/conversation": typeof lib_conversation;
  "lib/serviceRetry": typeof lib_serviceRetry;
  questions: typeof questions;
  storageCleanup: typeof storageCleanup;
  unansweredQuestions: typeof unansweredQuestions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
