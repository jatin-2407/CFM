// CLASSIFY is used by Classifier.ts: a message first looks for a pattern with its exact placeholders (100%); only
// when there is none, patterns scoring at least scoreCheck % match, and only if they have the same mustAgree
// placeholders as the message.
export const CLASSIFY = {
    scoreCheck: 70,
    // Add your placeholder ids here, e.g. '<IN>', '<OUT>': a message never matches a pattern that differs in them.
    mustAgree: [] as string[],
};

// WORD_TO_NUM is used by WordToNum.ts while seeding: messages are turned into nums batchSize at a time, and at most
// maxLoadedShards word files stay in memory. Lower it to use less memory; each shard dropped is written and read again.
export const WORD_TO_NUM = {
    batchSize: 10000,
    maxLoadedShards: 256,
};
