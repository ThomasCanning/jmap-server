// JMAP types per RFC 8620
//Ensure where these types are used that they adhere to the rules

/** JMAP Id: 1-255 octets, URL-safe base64 (A-Za-z0-9, -, _), no padding */
export type Id = string & { readonly __brand: "JmapId" }

/** Int: -2^53+1 <= value <= 2^53-1 (safe integer range) */
export type Int = number & { readonly __brand: "JmapInt" }

/** UnsignedInt: 0 <= value <= 2^53-1 */
export type UnsignedInt = Int & { readonly __brand: "JmapUnsignedInt" }

/** Date: RFC3339 date-time string, normalized (uppercase letters, no zero time-secfrac) */
export type Date = string & { readonly __brand: "JmapDate" }

/** UTCDate: Date with time-offset "Z" (UTC) */
export type UTCDate = Date & { readonly __brand: "JmapUTCDate" }
