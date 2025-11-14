export interface MoneroNode {
  id: string
  label: string
  uri: string
  username?: string
  password?: string
}

export const CUSTOM_NODE_ID = 'custom-node'

export const DEFAULT_NODES: MoneroNode[] = [
  {
    id: 'seth',
    label: 'sethforprivacy.com',
    uri: 'https://node.sethforprivacy.com:443',
  },
  {
    id: 'doggett-1',
    label: 'doggett.tech #1',
    uri: 'https://xmr1.doggett.tech:18089',
  },
  {
    id: 'salami',
    label: 'salami.network',
    uri: 'https://xmr.salami.network:18089',
  },
  {
    id: 'cryptostorm',
    label: 'cryptostorm.is',
    uri: 'https://xmr.cryptostorm.is:18081',
  },
]

export function getNodeById(id: string): MoneroNode | undefined {
  return DEFAULT_NODES.find(node => node.id === id)
}
