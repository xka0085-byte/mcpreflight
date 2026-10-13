# x402

[![Slack Community](https://img.shiel
ds.io/badge/Slack-Join%20Community-4A154B?log
o=slack&logoColor=white)](http://slack.x402.o
rg/)

x402 is an open standard for internet n
ative payments. It aims to support all networ
ks (both crypto & fiat) and forms of value (s
tablecoins, tokens, fiat).

```typescript
app
.use(
  paymentMiddleware(
    {
      "GET /
weather": {
        accepts: [...],          
       // As many networks / schemes as you w
ant to support
        description: "Weather 
data",    // what your endpoint does
      },

    },
  ),
);
// That's it! See examples/ f
or full details
```

## Installation

<detail
s>
<summary><b>Typescript</b></summary>

<br/
> 

> See all the packages available in the [
**Typescript SDK**](./typescript/), including
 chain implementations of x402, code examples
 and integration guides.

```shell
# All avai
lable reference sdks
npm install @x402/core \

  @x402/evm @x402/svm @x402/avm @x402/aptos 
@x402/casper @x402/stellar @x402/tvm @x402/he
dera @x402/keeta \
  @x402/axios @x402/fastif
y @x402/fetch @x402/express @x402/hono @x402/
next @x402/paywall @x402/extensions @x402/mcp

```

```shell
# Minimal Fetch client
npm ins
tall @x402/core @x402/evm @x402/svm @x402/fet
ch
```

```shell
# Minimal express Server
npm
 install @x402/core @x402/evm @x402/svm @x402
/express
```

</details>

<details>
<summary>
<b>Python</b></summary>

<br/> 

> See the [*
*`python/x402`**](./python/) folder for code 
examples and integration guides.

```shell
pi
p install x402
```

</details>

<details>
<su
mmary><b>Go</b></summary>

<br/> 

> See the 
[**`go/`**](./go/) folder for code examples a
nd integration guides.

```shell
go get githu
b.com/x402-foundation/x402/go/v2
```

</detai
ls>


## Principles

- **Open standard:** x40
2 is an open standard, freely accessible and 
usable by anyone. It will never force relianc
e on a single party.
- **HTTP / Transport Nat
ive:** x402 is meant to seamlessly complement
 existing data transportation. It should when
ever possible not mandate additional requests
 outside the scope of a typical client / serv
er flow.
- **Network, token, and currency agn
ostic:** we welcome contributions that add su
pport for new networks (both crypto and fiat)
, signing standards, or schemes, so long as t
hey meet our acceptance criteria laid out in 
[CONTRIBUTING.md](https://github.com/x402-fou
ndation/x402/blob/main/CONTRIBUTING.md). x402
 may extend support to fiat based networks, b
ut will never deprioritize onchain payments i
n favor of fiat payments.
- **Backwards Compa
tible:** x402 will not deprecate support for 
any existing networks unless such removal is 
deemed necessary for the security of the stan
dard. Whenever possible, x402 will aim for ba
ckwards compatibility for non-major version c
hanges.
- **Trust minimizing:** all payment s
chemes must not allow for the facilitator or 
resource server to move funds, other than in 
accordance with client intentions
- **Easy to
 use:** It is the goal of the x402 community 
to improve ease of use relative to other form
s of payment on the Internet. This means abst
racting as many details of crypto as possible
 away from the client and resource server, an
d into the facilitator. This means the client
/server should not need to think about gas, r
pc, etc.

## Ecosystem

**Community:** join t
he [x402 Slack](http://slack.x402.org/) to as
k questions, discuss ideas, and share what yo
u're building.

Curated third-party SDKs, ext
ensions, and facilitators are listed in the [
Developer Tools docs](https://docs.x402.org/d
ev-tools/overview). For broader discovery of 
x402 services and integrations, see community
-maintained directories such as [x402scan.com
](https://x402scan.com), [Agentic.Market](htt
ps://agentic.market), [Pay.sh](https://pay.sh
), [app.ampersend.ai/discover](https://app.am
persend.ai/discover), and [x402-list.com](htt
ps://x402-list.com).

**Roadmap:** see [ROADM
AP.md](https://github.com/x402-foundation/x40
2/blob/main/ROADMAP.md)

**Documentation:** s
ee [`docs/`](./docs/) for the published docum
entation source (Mintlify). Payment **schemes
** include **`exact`**, **`upto`**, and **`ba
tch-settlement`**; specifications live under 
[`specs/schemes/`](./specs/schemes/).

## Cho
osing a Production Path

For testnet developm
ent and quickstarts, the public x402 facilita
tor is the easiest way to get started. For pr
oduction mainnet routes, decide on your facil
itator model explicitly:

- use a production 
facilitator provider that supports your targe
t network,
- run your own facilitator,
- or [
self-facilitate](./examples/typescript/server
s/self-facilitation/README.md) inside your re
source server.

Do not assume the public x402
.org facilitator is the default production pa
th for mainnet EVM routes. See the [Facilitat
or docs](https://docs.x402.org/core-concepts/
facilitator), [Facilitators directory](https:
//docs.x402.org/dev-tools/facilitators), and 
[Networks & Token Support](https://docs.x402.
org/core-concepts/network-and-token-support) 
for operator guidance.

## Terms:

- `resourc
e`: Something on the internet. This could be 
a webpage, file server, RPC service, API, any
 resource on the internet that accepts HTTP /
 HTTPS requests.
- `client`: An entity wantin
g to pay for a resource.
- `facilitator`: A s
erver that facilitates verification and execu
tion of payments for one or many networks.
- 
`resource server`: An HTTP server that provid
es an API or other resource for a client.

##
 Technical Goals:

- Permissionless and secur
e for clients, servers, and facilitators
- Mi
nimal friction to adopt for both client and r
esource servers
- Minimal integration for the
 resource server and client (1 line for the s
erver, 1 function for the client)
- Ability t
o trade off speed of response for guarantee o
f payment
- Extensible to different payment f
lows and networks

## Specification

See `spe
cs/` for full documentation of the x402 stand
ard/

### Typical x402 flow

x402 payments ty
pically adhere to the following flow, but ser
vers have a lot of flexibility. See `advanced
` folders in `examples/`.
![](./static/flow.p
ng)

The following outlines the flow of a pay
ment using the `x402` protocol. Note that ste
ps (1) and (2) are optional if the client alr
eady knows the payment details accepted for a
 resource.

1. `Client` makes an HTTP request
 to a `resource server`.

2. `Resource server
` responds with a `402 Payment Required` stat
us and a `PaymentRequired` b64 object return 
as a `PAYMENT-REQUIRED` header.

3. `Client` 
selects one of the `PaymentRequirements` retu
rned by the server response and creates a `Pa
ymentPayload` based on the `scheme` & `networ
k` of the `PaymentRequirements` they have sel
ected.

4. `Client` sends the HTTP request wi
th the `PAYMENT-SIGNATURE` header containing 
the `PaymentPayload` to the resource server.


5. `Resource server` verifies the `PaymentPa
yload` is valid either via local verification
 or by POSTing the `PaymentPayload` and `Paym
entRequirements` to the `/verify` endpoint of
 a `facilitator`.

6. `Facilitator` performs 
verification of the object based on the `sche
me` and `network` of the `PaymentPayload` and
 returns a `Verification Response`.

7. If th
e `Verification Response` is valid, the resou
rce server performs the work to fulfill the r
equest. If the `Verification Response` is inv
alid, the resource server returns a `402 Paym
ent Required` status and a `Payment Required 
Response` JSON object in the response body.


8. `Resource server` either settles the payme
nt by interacting with a blockchain directly,
 or by POSTing the `Payment Payload` and `Pay
ment PaymentRequirements` to the `/settle` en
dpoint of a `facilitator server`.

9. `Facili
tator server` submits the payment to the bloc
kchain based on the `scheme` and `network` of
 the `Payment Payload`.

10. `Facilitator ser
ver` waits for the payment to be confirmed on
 the blockchain.

11. `Facilitator server` re
turns a `Payment Execution Response` to the r
esource server.

12. `Resource server` return
s a `200 OK` response to the `Client` with th
e resource they requested as the body of the 
HTTP response, and a `PAYMENT-RESPONSE` heade
r containing the `Settlement Response` as Bas
e64 encoded JSON if the payment was executed 
successfully.

### Schemes

A scheme is a log
ical way of moving money.

Blockchains allow 
for a large number of flexible ways to move m
oney. To help facilitate an expanding number 
of payment use cases, the `x402` protocol is 
extensible to different ways of settling paym
ents via its `scheme` field.

Each payment sc
heme may have different operational functiona
lity depending on what actions are necessary 
to fulfill the payment.
For example, **`exact
`** transfers a specific amount (for example,
 pay $1 to read an article). **`upto`** autho
rizes up to a maximum per request; the seller
 settles the actual usage, up to that cap. **
`batch-settlement`** (EVM) uses escrow and of
f-chain vouchers so sellers can redeem many s
mall charges onchain in batches instead of se
ttling every HTTP request separately.

See `s
pecs/schemes` for full scheme specifications;
 `specs/schemes/exact/scheme_exact_evm.md` de
scribes **exact** payments on EVM chains.

##
# Schemes vs Networks

Because a scheme is a 
logical way of moving money, the way a scheme
 is implemented can be different for differen
t blockchains. (ex: the way you need to imple
ment `exact` on Ethereum is very different fr
om the way you need to implement `exact` on S
olana).

Clients and facilitators must explic
itly support different `(scheme, network)` pa
irs in order to be able to create proper payl
oads and verify / settle payments.


