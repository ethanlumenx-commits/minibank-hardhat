// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.2 <0.9.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MiniBank is ERC20, Ownable {
    // 铸币给部署者
//     *   **代币名称**：GreenLeaf Token
// *   **代币符号**：GLT

// *   **小数位数**：18 位（符合 ERC20 标准默认值，便于与主流钱包 / 交易所兼容）

// *   **总供应量**：1 亿枚（100,000,000 GLT）
    uint public immutable contractTime;
    constructor() ERC20("GreenLeaf Token", "GLT") Ownable(msg.sender) {
        contractTime = block.timestamp;
        _mint(msg.sender, 100_000_000*(10**18));
    }
    // ，代币发行后总供应量可增发
    function mint(address to, uint256 amount)external onlyOwner{
        _mint(to,amount);
    }

    // 冻结事件
    event accounForzen(address indexed account, bool frozen);
     // 设置手续费收款地址
    event setResfounEvent(address indexed account);
    // 手续费设置
    event setTaxBpsEvent(uint256 indexed tax, uint256 indexed BPS);

    //   **转账限制（针对早期阶段）**
//     *   部署后 180 天内，限制普通用户单日转账总额不超过其持有的 5%（防止大额抛售）。
    mapping (address => mapping(uint256 => uint256)) public dailyTransferLimit; // from  （转账天数，转账额度）
    
    // 白名单地址
    mapping(address => bool)private  isExcludedFromLimit;

    // 仅合约创立者可以设置白名单
    function setExcludedFromLimit(address account, bool excluded)external onlyOwner{
        isExcludedFromLimit[account] = excluded;
    }

    function checkAmount(address from, uint256 amount)internal{
        // 发起交易时间记录
        uint256 today = block.timestamp / 1 days;

        // 转账限制额度，持仓的5%
        uint256 limit = balanceOf(from) * 5 / 100;
        require(dailyTransferLimit[from][today] + amount <= limit, "Exceeds daily transfer limit");
        
        // 转账地址，时间，金额记录
        dailyTransferLimit[from][today] += amount;
        
    }

    
    // 转移管理员地址 继承onlyOwner的transferOwnership
    function transferOwnership(address newOwner) public override onlyOwner {
        super.transferOwnership(newOwner);
    }

    // 管理员冻结或解冻指定地址，被冻结地址无法进行转账、授权等操作（但可接收代币）
    mapping(address => bool)public frozenAccounts;
    function freezeAccount(address account, bool frozen) external onlyOwner{
        frozenAccounts[account] = frozen;
        emit accounForzen(account, frozen);
    }

    // 设置手续费收款地址
    address public resfoun;   //手续费收款地址
    uint256 public TAX_BPS = 200; // 税率 2%，BPS = 百分之一百分点（basis points）
    uint256 public BPS_DENOM = 10000; // 基数
    function setResfoun(address account)external onlyOwner{
        require(account != address(0),"account error");
        resfoun = account;
        emit setResfounEvent(account);
    }

    // 设置税率
    function setTaxBps(uint256 tax, uint256 BPS)external onlyOwner{
        TAX_BPS = tax;
        BPS_DENOM = BPS;
        emit setTaxBpsEvent(tax, BPS);
    }

    /** 冻结地址检查
     * @dev 重写 _beforeTokenTransfer，在转账、mint、burn 前检查
     * 注意：mint 和 burn 也会触发 _beforeTokenTransfer，所以要根据需求决定是否限制它们
     */
    function _update (address from, address to, uint256 amount)internal override{
        // 排除mint 和 burn，防止误添加address（0），导致mint和burn无法使用
        if(from != address(0) && to != address(0)){
            // 如果在冻结地址，就取反，跳出函数,transfer 和 trandferfrom都会先走一遍_update
            require(!frozenAccounts[from], "Account is frozen");

            // 在合约创建后的180天内
            if(contractTime + 180 days > block.timestamp){
                // 不在团队白名单地址上
                if(!isExcludedFromLimit[from]){
                    // 检查每日5%限额
                    checkAmount(from, amount);
                }
            }
            // 税费
            uint256 fee = amount * TAX_BPS / BPS_DENOM; // 2% 税费
            uint256 receiveAmount = amount - fee; // 实际到账金额
            // 更新转账金额
            super._update(from, to, receiveAmount);
            // 税费转到基金
            super._update(from, resfoun, fee);
            return;
        }
        // 铸币和销毁不走手续费
        super._update(from, to, amount);
    }
    


}


