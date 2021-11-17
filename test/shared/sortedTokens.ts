import { MockERC20 } from '@custom-types/contracts'

export function compareToken(a: MockERC20, b: MockERC20): -1 | 1 {
    return a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1
}

export function sortedTokens(a: MockERC20, b: MockERC20): [typeof a, typeof b] | [typeof b, typeof a] {
    return compareToken(a, b) < 0 ? [a, b] : [b, a]
}
