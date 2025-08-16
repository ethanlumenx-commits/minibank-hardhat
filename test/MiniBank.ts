// 从 chai 库中导入 expect，用来做断言（判断测试结果是否符合预期）
import { expect } from "chai";

// 从 hardhat 导入 ethers，用来和以太坊网络交互（部署合约、发送交易等）
import { ethers } from "hardhat";

// 从 TypeChain 自动生成的类型定义里导入 MiniBank 类型（让 TypeScript 知道 token 的方法和参数类型）
import { MiniBank } from "../typechain-types";

// describe 用来分组测试用例，第一个参数是分组名称，第二个参数是一个函数，里面写具体的测试
describe("MiniBank Token Tests", function () {
  
  // 定义几个变量来存储测试过程中用到的对象
  let token: MiniBank;  // token 是我们部署的 MiniBank 合约实例
  let owner: any, addr1: any, addr2: any, fund: any; // 四个账户：部署者、用户1、用户2、生态基金账户

  // beforeEach 会在每个 it 测试用例运行前执行一次（保证每个测试都是全新的合约环境）
  beforeEach(async function () {
    // 获取四个测试账户（Hardhat 会自动提供）
    [owner, addr1, addr2, fund] = await ethers.getSigners();

    // 获取 MiniBank 合约工厂（相当于合约的“构造器”）
    // 从编译好的 artifacts 中找到这个合约的 ABI 和 Bytecode，并返回一个工厂对象
    const MiniBankFactory = await ethers.getContractFactory("MiniBank");

    // 部署合约，并断言类型为 MiniBank
    // deploy() 用这个模具生产一个新的合约, 并等待部署完成
    token = (await MiniBankFactory.deploy()) as MiniBank;

    // 等待你的合约在链上完成部署，并返回一个已经可用的合约实例。
    await token.waitForDeployment();
  });

  // 第一个测试：检查部署时，owner 是否获得全部代币
  it("部署时给 owner 分配全部代币", async function () {
    const totalSupply = await token.totalSupply(); // 获取总代币量
    const ownerBalance = await token.balanceOf(owner.address); // 获取 owner 的余额
    // expect(...) 期望（这个值）.to.equal(另一个值)  equal相等
    expect(ownerBalance).to.equal(totalSupply); // 判断两者相等
  });

  // 第二个测试：检查设置生态基金地址后，转账是否会扣 2% 税
  it("设置生态基金地址并收税", async function () {
    await token.setResfoun(fund.address); // 设置生态基金收款地址

    const amount = ethers.parseEther("100"); // 100 GLT（因为精度是 18 位，所以要转成 Wei）
    await token.transfer(addr1.address, amount); // 从 owner 给 addr1 转 100 GLT

    const balance1 = await token.balanceOf(addr1.address); // addr1 的余额
    expect(balance1).to.equal(ethers.parseEther("98")); // 应该收到 98 GLT

    const balanceFund = await token.balanceOf(fund.address); // 基金地址的余额
    expect(balanceFund).to.equal(ethers.parseEther("2")); // 应该收到 2 GLT
  });

  // 第三个测试：检查冻结账户后是否无法转出
  it("冻结账户后不能转出", async function () {
    await token.setResfoun(fund.address); // 先设置基金地址
    await token.transfer(addr1.address, ethers.parseEther("50")); // owner 给 addr1 转 50 GLT

    await token.freezeAccount(addr1.address, true); // 冻结 addr1

    // 断言：addr1 转账会失败，并提示 "Account is frozen"
    await expect(
        //token.connect(addr1)  token绑定的是合约部署者，token.connect(addr1)可以切换到addr1的地址
      token.connect(addr1).transfer(addr2.address, ethers.parseEther("10"))
      // 某个交易会失败（revert）并且带有特定错误信息。
    ).to.be.revertedWith("Account is frozen");
  });

  // 第四个测试：检查 180 天内转账限额（不能超过余额的 5%）
  it("180 天内限额测试", async function () {
    await token.setResfoun(fund.address); // 设置基金地址
    await token.mint(addr1.address, ethers.parseEther("100")); // 给 addr1 mint 100 GLT，不收手续费
    // await token.transfer(addr1.address, ethers.parseEther("100")); // 给 addr1 100 GLT，会扣2%手续费

    const limit = ethers.parseEther("5"); // 5% 限额 = 5 GLT

    expect(await token.balanceOf(addr1.address)).to.be.equal(ethers.parseEther("100"));

    // 超过 5 GLT 会报错
    await expect(
      token.connect(addr1).transfer(addr2.address, ethers.parseEther("6"))
    ).to.be.revertedWith("Exceeds daily transfer limit");
    

    // 正好转 5 GLT
    await token.connect(addr1).transfer(addr2.address, limit);


    const balance2 = await token.balanceOf(addr2.address); // addr2 实际到账
    expect(balance2).to.equal(ethers.parseEther("4.9")); // 扣掉 2% 税后，应该是 4.9 GLT
  });

  // 第五个测试：检查 180 天后转账限额是否已解除
  it("180 天后限额测试", async function () {
    await token.setResfoun(fund.address); // 设置基金地址
    await token.mint(addr1.address, ethers.parseEther("100")); // 给 addr1 mint 100 GLT，不收手续费

    const limit = ethers.parseEther("5"); // 5% 限额 = 5 GLT

    expect(await token.balanceOf(addr1.address)).to.be.equal(ethers.parseEther("100"));

    // 先模拟时间往后推 181 天
    await ethers.provider.send("evm_increaseTime", [181 * 24 * 60 * 60]);
    // 立刻挖一个新块，并把刚才改过的时间应用到链上。
    await ethers.provider.send("evm_mine");

    // 现在应该可以转账超过 5 GLT 了
    await token.connect(addr1).transfer(addr2.address, ethers.parseEther("6"));

    const balance4 = await token.balanceOf(addr2.address); // addr2 实际到账
    expect(balance4).to.equal(ethers.parseEther("5.88")); // 扣掉 2% 税后，应该是 5.88 GLT
  });
});