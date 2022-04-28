import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract, BigNumber, constants, Signer } from 'ethers';
import {
  keccak256,
  defaultAbiCoder,
  toUtf8Bytes,
  solidityPack,
  arrayify,
  joinSignature,
  SigningKey,
  splitSignature
} from 'ethers/lib/utils';
import { Address } from 'cluster';

const EIP712DOMAIN_TYPEHASH = keccak256(
  toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
);

const PERMIT_TYPEHASH = keccak256(
  toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'),
);

function getDomainSeparator(name: string, version: string, chainId: number, address: string) {
  return keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [EIP712DOMAIN_TYPEHASH, keccak256(toUtf8Bytes(name)), keccak256(toUtf8Bytes(version)), chainId, address],
    ),
  );
}

async function getApprovalDigest(
  chainId: number,
  token: Contract,
  approve: {
    owner: string;
    spender: string;
    value: BigNumber;
  },
  nonce: BigNumber,
  deadline: BigNumber,
): Promise<string> {
  const name = await token.name();
  const version = await token.version();
  const DOMAIN_SEPARATOR = getDomainSeparator(name, version, chainId, token.address);
  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        DOMAIN_SEPARATOR,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
            [PERMIT_TYPEHASH, approve.owner, approve.spender, approve.value, nonce, deadline],
          ),
        ),
      ],
    ),
  );
}

describe('ERC20/ERC2612', () => {
  let erc20Permit: Contract;

  const contractVersion = 'v1.0.0';
  const tokenName = 'template';
  const tokenSymbol = 'TEMP';
  const tokenDecimals = BigNumber.from('18');
  const supply = constants.MaxUint256;

  let wallet: Signer;
  let walletTo: Signer;
  let walletAddress: string;
  let walletToAddress: string;


  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    [wallet, walletTo] = accounts;

    walletAddress = await wallet.getAddress();
    walletToAddress = await walletTo.getAddress();

    const ERC20Permit = await ethers.getContractFactory('ERC20Permit', wallet);
    erc20Permit = await ERC20Permit.deploy(tokenName, tokenSymbol, tokenDecimals, supply);
    await erc20Permit.deployed();


  });

  describe('#permit()', () => {
    it('should be success', async () => {
      

      const value = constants.MaxUint256;
      const chainId = await wallet.getChainId();
      const deadline = constants.MaxUint256;
      const nonce = await erc20Permit.nonces(walletAddress);

      const digest = await getApprovalDigest(
        chainId,
        erc20Permit,
        { owner: walletAddress, spender: walletToAddress, value },
        nonce,
        deadline
      );

      const hash = arrayify(digest);

      const sig = joinSignature(
        new SigningKey('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80').signDigest(hash),
      );

      const { v, r, s } = splitSignature(sig);

      erc20Permit = erc20Permit.connect(walletTo);

      await expect(erc20Permit.permit(walletAddress, walletToAddress, value, deadline, v, r, s))
        .to.emit(erc20Permit, 'Approval').withArgs(walletAddress, walletToAddress, value);
      expect(await erc20Permit.allowance(walletAddress, walletToAddress)).to.be.equal(value);
    });
  });
});