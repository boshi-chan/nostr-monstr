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
    label: 'Cake Wallet (US)',
    uri: 'https://node.cakewallet.com:18081',
  },
  {
    id: 'cake-eu',
    label: 'Cake Wallet (EU)',
    uri: 'https://node2.cakewallet.com:18081',
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
