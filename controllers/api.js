/**
 * 响应客户端api请求，调用API，返回json结果作为响应
 * 注意，方法名应与routeApi.js保持一致
 * 额外，login将重定向到total页面，logout将渲染login页面
 * 可响应：
 * [1]Web客户端的ajax请求
 * [2]移动客户端的http请求
 * 注意，可利用session保存一些区块数据，减少API调用，以提高性能
 */
var FConn = require('./fconn');
var crypto = require('crypto');

var MongoClient = require("mongodb").MongoClient;
var DBurl = 'mongodb://localhost:27017/myproject';
const assert = require('assert');
var mgclient = null;

exports.login = function (req, res, next) {
    let username = req.body.username;
    let password = req.body.password;
    // // console.log(username);
    // // next()
    // (async () => {
    //     try {
    //         let fc = await FConn.FConnect(username);
    //         if (fc === undefined) {
    //             return res.render('login', {
    //                 title: 'Login',
    //                 messages: '未注册用户'
    //             });
    //         } else {
    //             req.session.username = username;
    //             fc_list[username] = fc;
    //             return res.redirect('total');
    //         }
    //     } catch (err) {
    //         // console.error(err);
    //         if (err) {
    //             return res.render('login', {
    //                 title: 'Login',
    //                 messages: err
    //             });
    //         }
    //     }
    // })();
    (async () => {
        try {
            mgclient = await MongoClient.connect(DBurl);
            let col = mgclient.db().collection('users');
            //查询mongodb并与输入的帐号密码进行匹配。
            await col.find({ "_id": username }).toArray(function (err, docs) {
                assert.equal(err, null);
                console.log(docs);
                let docsStr = docs.join();
                if (docsStr == "") {
                    //throw new Error('用户不存在');
                    return res.render('login', {
                        title: 'Login',
                        messages: '未注册用户'
                    });
                } else{
                    password = crypto.pbkdf2Sync(password, 'njustXP2018', 10000, 64, 'md5').toString('base64');
                    if (username == docs[0]._id &&  password == docs[0].pwd) {
                        req.session.username = username;
                        //fc_list[username] = fc;
                        (async () => {
                            let fc = await FConn.FConnect(username);
                            fc_list[username] = fc;
                            return res.redirect('total');
                        })()
                    } else {
                        return res.render('login', {
                            title: 'Login',
                            messages: '密码错误'
                        });
                    }
                }
            });
            mgclient.close();
        } catch (err) {
            console.log('连接出错：', err);
            if (err) {
                return res.render('login', {
                    title: 'Login',
                    messages: err
                });
            }
        }
    })()
};

exports.logout = function (req, res, next) {
    let username = req.session.username;
    delete fc_list[username];
    req.session.destroy();
    return res.render('login', {
        title: 'Login',
        messages: '已退出!'
    });
};

exports.register = function (req, res, next) {
    let username = req.body.username;
    let password = req.body.password;

    var register = require('../../fabcar/registerUser');
    var args = process.argv.splice(2);
    var file = 'crtuser.json';
    // var username = args[1];
    (async () => {
        try {
            let cert = await register.registerUser(file, username); //cert
            // console.log(cert);
            let salt = 'njustXP2018';  //Buffer


            //@TODO
            // 把salt=>string

            //需要从salt是个string
            password = crypto.pbkdf2Sync(password, salt, 10000, 64, 'md5').toString('base64');

            let write = { _id: username ,pwd: password, ca: cert.toString(), isValid: true };

            const MongoClient = require('mongodb').MongoClient; //mongo
            let client = await MongoClient.connect('mongodb://localhost:27017/myproject');
            let col = client.db().collection('users');
            let r = await col.insertOne(write);
            const assert = require('assert');
            assert.equal(1, r.insertedCount);
            client.close();

            return res.render('login', {
                title: 'Login',
                messages: '注册成功'
            });
        } catch (err) {
            console.log('注册出错:', err);
            return res.render('register', {
                title: 'Register',
                messages: '注册失败：'+err
            });
        }
    })()
}
//计算持有虚币个数，最后交易价格，传给前端用于计算当前市值
exports.getLastValue = function (req, res, next) {
    var username = req.session.username;
    if (username === null) {
        return res.render('login', {
            title: 'Login',
            messages: '请先登录!'
        });
    }
    (async () => {
        try {
            let fc = fc_list[username];
            //let mykeys = await eval('fc.mykeys("bid00","bid99")');
            let mykeys = await fc.mykeys("bid00", "bid99");
            let count = 0;
            for (let key in mykeys) {
                //if (mykeys[key]['isMine'] === true) {  //避免用数组形式来访问非数组结构
                if (mykeys[key].isMine) count++;
            }
            let last_tx_value_max = 0;
            //let last_tx = await eval('fc.mytxlast()');
            let last_tx = await fc.mytxlast(); //调用该方法有风险，最后一次交易可能不是用户链码交易，可能是链码升级
            //console.log(last_tx);
            //下面可以简化，多个value是相同值，一笔交易购买多个虚币也是同一个价格，股票证券交易也如此
            /*
            last_tx['writeset'].forEach(write => {
                last_tx_value_max = Number(write['value']) > last_tx_value_max ? Number(write['value']) : last_tx_value_max;
                console.log(last_tx_value_max);
            });
            */
            if (last_tx.writeset.length > 0) {
                last_tx_value_max = last_tx.writeset[0].value
            }
            res.write(JSON.stringify({
                'count': count,
                'last_tx_value': last_tx_value_max
            }));
        } catch (err) {
            console.error(err);
            res.write('错误:' + err); //?
            //res.end(err.stringify()) //输出?
        }
        res.end();
    })();
};
//计算收入(卖出)，利润
//投入总价，一起计算
exports.getIncomeAndProfit = function (req, res, next) {
    var username = req.session.username;
    // console.log(username);
    if (username === null) {
        return res.render('login', {
            title: 'Login',
            messages: '请先登录!'
        });
    }
    (async () => {
        try {
            let fc = fc_list[username];
            //let mytx = await eval('fc.mytx()');
            //注意，函数mytx要遍历整条链，如果超过1000个区块，页面就挂了，可能超过10秒
            //相同页面上已经调用过一次
            //建议页面上用一个进度条显示进度，然后用session保存一个数组mytx，以后每次购买完成之后都mytx.push(新交易)
            //用增量更新来避免完整更新，以改善性能
            let mytx = await fc.mytx();
            let profit = 0; //利润
            let income = 0; //卖出总价
            let buyin = 0; //买入总价
            //for (let i = 0; i < mytx.length; i++) { //每个交易
            //    let tx = mytx[i];
            for (let tx of mytx) {
                //let now_txid = tx['tx_id'];
                let now_txid = tx.tx_id;
                //let writeset = tx['writeset'];
                let writeset = tx.writeset;
                //console.log(now_txid);
                //for (let j = 0; j < writeset.length; j++) { //每一个key=bidXX
                //    let the_b = writeset[j];
                for (let the_b of writeset) {
                    let the_tx_value = 0;
                    let now_value = 0;
                    //let the_history = await eval('fc.query("history","' + the_b['key'] + '")');
                    let the_history = await fc.query("history", the_b['key']); //key历史
                    the_history = JSON.parse(the_history);
                    let count = 0;
                    for (let k = 0; k < the_history.length; k++) {
                        //console.log(the_history[k]);
                        //if (the_history[k]['txid'] === now_txid) {
                        if (the_history[k].txid === now_txid) {
                            count = k;
                        }
                    }
                    //此时count指向买入交易
                    //the_tx_value = Number(the_history[count]['value']); //买入价格
                    the_tx_value = Number(the_history[count].value); //买入价格
                    buyin += the_tx_value;
                    if (count !== (the_history.length - 1)) { //买入交易是否为最后交易
                        now_value = Number(the_history[count + 1].value); //若不是，下一个交易就是卖出，取卖出价格
                        income += now_value;
                        profit += (now_value - the_tx_value);
                    }
                }
            } //以上计算比较复杂，能否简化？
            res.write(JSON.stringify({
                'income': income,
                'profit': profit,
                'buyin': buyin
            }));

        } catch (err) {
            console.error(err);
            res.write('错误:' + err); //?
            //res.end(err.stringify()) //输出?
        }
        res.end();
    })();

};
//通用API调用， 比如 /?cmd=query('history','bid01')
exports.api = function (req, res, next) {
    var username = req.session.username;
    if (username === null) {
        return res.render('login', {
            title: 'Login',
            messages: '请先登录!'
        });
    }
    (async () => {
        try {
            // let ret = await eval(cmd);
            var fc = fc_list[username];
            var cmd = 'fc.' + req.query.cmd;
            console.log(cmd);
            if (cmd.startsWith('fc.invoke')) {
                eval(cmd); //注意，invoke调用也可能有返回，但invoke(put,k,v)无返回
                res.write('提交交易成功！');
            } else {
                var ret = await eval(cmd);
                if (ret !== undefined) {
                    // console.log(ret);
                    res.write(JSON.stringify(ret))
                    // res.write(ret)
                }
            }
        } catch (err) {
            console.error(err);
            res.write('错误:' + err); //?
            //res.end(err.stringify()) //输出?
        }
        res.end();
    })();
};