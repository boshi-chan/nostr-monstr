export interface MoneroNode {
  id: string
  label: string
  uri: string
  username?: string
  password?: string
}

export const DEFAULT_NODES: MoneroNode[] = [
  {
    id: 'cake-us',
    label: 'Cake Wallet',
    uri: 'https://xmr-node-cakewallet.com:18081',
  },
  {
    id: 'hashvault',
    label: 'HashVault',
    uri: 'https://nodes.hashvault.pro:18081',
  },
  {
    id: 'seth',
    label: 'sethforprivacy.com',
    uri: 'https://node.sethforprivacy.com:443',
  },
]

export function getNodeById(id: string): MoneroNode | undefined {
  return DEFAULT_NODES.find(node => node.id === id)
}
