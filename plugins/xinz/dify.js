/**
 * @author seven (adapted by xinz for Dify)
 * @name dify 
 * @team xinz
 * @version 2.3.0 // Version bump for custom prompt setting
 * @description 通过 Dify API 进行聊天对话，可自定义参考用模型信息和系统提示。
 * @rule ^[aA] ([\s\S]+)$
 * @rule ^[aA]$
 * @admin false
 * @public false
 * @priority 99990
 * @classification ["AI"]
 * @disable false
 * @service false
 */

/*
 * 依赖说明:
 * 1. node-fetch (v3+ is ESM)
 * 2. uuid (Optional)
 * !! 本插件不再自动安装依赖 !!
 * 请手动安装: npm install node-fetch uuid
 *
 * 配置说明:
 * 1. 在 Dify 应用中配置好模型、主要提示词等。
 * 2. 在 Bncr Web UI 插件设置中配置 Dify API 地址、密钥。
 * 3. 可选配置自定义系统提示词 (效果取决于Dify应用设置)。
 */

// --- 引入/声明全局对象和依赖 ---
let fetch, uuid;
/** Code Encryption Block[419fd178b7a37c9eae7b7426c4a04203eccc74889588e76f2f619a7024a36c8fd857def5ccf504de79907cc6e8932b3e01539d5b794734086aa1470bbf99324476bacc0fc39a73289df0d28b1a4fdf1649062ca3b25bb2d21a0725b71ea2db15dbe75d6952e84476e300ed024204aff2daf2c1d7f838bf468b4be258e92bef625969e696f1135ed4340ed208ce7f218fb48bb87dbcb892d96dddd0342684227e169deae4f03faff5b6634f156b3fff06083cc1fa24866030d8f8722470ee39a24f2566eab4edbd29ca95fd41609d7f81105a55421a12f1c6e05c62e516892dce3343271d320eaf51037ea07e938d12fa16a9dd25b7b27a5d8c2b0362517fe566e714825dec0157d35fc73754b63fd5a73bba2dc9ebef8daef0126a12929b899e17dbcab2744e84ea1bc4913499a702491a67beb911cffd64381f44d0722f2327b6eec1250f570a990ae06ba491e0143b66027d78adb79b7e196b59ea8d62a6cf3eeaec6b5db075b3140d650a15ad66c8bcf17ee004427a7d5cbf1aada6f792e31ea94a5c39d985c62fefae05f3d1e15be3e563e8c4f7086b3baea1ba845a5698fd8374593cab438e8cd4f327ed7b34d225808040c9c581cd3fc1734cccdd1aded7f506a85596a1f7a82c0a3d04e09f73996440209af222fcebf7617ce196d580cdcaf4dbbc7c7b7b29d05e6fae1d159a8559bd247ca6678cff47f6ea666261d3275e2593ac9ce35082ab08fd0a313712d176e560dcb36b13f69b1f45e5f8522b1808d295b0fd3b461d18aa5f77c54cf44f2543fad17e4bc8c04e16106a38eddfac61cf709d9d9e5bd80dada067637cad3f6533f896aa3c84d7d2a1e677c1b7d90b914f871f6fbeb6748dac31e4db37fd8085bb04965dcc692bb0ff1294ab1f2fd5712769d61243bc88407a2e3a0e5ebe3680110aacfdb85ec6f58981b58d89035eaf5717aee95edec7bab5dc0ea389aa6263be55686ad4759d20dc1d65c3e720f2d3ded17db7e28c213e41025000ed4e647d38ca3889a5c5d0fb2e12e082fcda4144fe1f5a432720631ade4bc50d9c0ed354b85d30086a115a1d61f53ff306fde8950e0c57e6773fdd65fec92390159b657be4520f4a0fa618f07a96dd29d357db03763d6d061874e0571b4d9cf4416a7e456435c12f0cf15c3e873b0d6d5f0507836aff9093cca54a4fdbfa6d720ed05e2c183ef3e1a4535e9aab663e3159ca466d4f843bf50439f7059bbea8b3c5e515e1cbaef76b4ce62b7f57263028ac5b4bb2ea84739b34d7f8fc878037bb05b7a4c49ad1ccb97fa64cd65a6bd47bada34a18ce663d89e46b94af61b288ddb9ebafba118bafa7ef75e11d95a4839caf64d3d57459114a9906921bef63383947005a8249ab0c5c60788f95a7ea41676dc27228b53e618de2173907571da9cee77f94e5b5bb4cc5b4b26beb0c4d921b8e9de99d99bf365829dbbb602ba48da80695cbeb60232e17ff5e4aab2acf1e07f27567e30a1cb6208550f91785c324f3d9fcf6604c2ad21ebfc133bd00d62ee1ce5bee423ce8d471379ceef7f72fa0f155c9500d5b344341a5e8440fb1cbe8863aa336feb2f9218ad8206d45f600a3b1e129e5b45a5041a50db1ffe3d325c7ad7171c92e1a349b291cdb6b745c6a6761d96ba7afa56a295858aca34fa1552310b707a0ac2347f04dbf6037bcea74ad666006bdfe88c997f29a0b57bbaf57c4bf6bfa0a043424dc17daaab6c2b396ca067b06b685c55d23cf5e2654f366b173f0516046d13e1fa841002287979dd688104924d5fbe6213066a314382497202b37b0a0acccf32af2f2ab187e61ed8b2531d944e35a2205a835ef076329441f6e5a1373c58e7ce0412af80aad696db846debf6fd53c01c22bbcf8bfe3749d7169103d0e4393fedfc9efff28454266db928f0f9a30a934ac647ac02edf7aeb7ba231c930b2f0ef697fa2a7ca5dfada526e1f2556e28fa0dc20f34c97ab40c3cef6536c58866768ccf12e3d72c9d990ff0c53ba79468e98517a8d80363222eee4883f7513215272bec43c15ebfb362ec47d7e57dc80d7ba7e91ae6956b07fd85883f0a38d8760909dd358bb7f46d623bc382850a3c1e121d7afe856be51dda00c3e37d19a3d125082a7832387bf25585e1f0483f64fcdb57167f2da290421f2ecf99bff7ad62f13c90fbffaff0b93b907502b1b9870899915101218ae38dc29fab45b27dcb9b6df7971b9e1fc489101f642f5ac0f8ceb9700961cfe73e8fef890d0fc9ca2cf64025c8b60aebecb7b099e6eef74a2fd917eb0d4c02b1f0b2157eb3be9246bac4034db0c9e04c678d646e696c9594fda0a6b147a7515fa4284c8486cafb661453c49d6f6fa3420853f7a5381109c2c325a6aaa7e368e651dc5ed8729811d6d10d5366e6675ae0f0177e43fd4cad747be0bde2082c6c7b94f039de78852b777cc8386ea6a754c6e598a1fb4ec9d9aadfbd96fcdd88b906b1a4c3a79e408b63f9dab010a8e41a64ac719b0a88140d76a5d46b1e35842b3f047d627f2e6a9d9e2cd7302a779c5ece0f5e7aac34f2ec89abb287163a59bd102b2d8a3fb87b416d3f4dd8357c24d87eeedf7b77da5d8e046be077288c978f10af4eef455f250e3caf158eec0260a4c8d76c59a4fe8e0226acfc0982528b70ee29b2b48af16bde82930f84e748df29da0db62b8cc14310c86041a28e523c897a743005ce7fb9db2176205392d1c49af5b1742d6c7b45c949ad3ba626e39f77fb09b893cd4b1ecc3af1e487130699bfc8466f6ac5fabcb0bc16a157034504e997883bbe8dce1086fe60c5faf0982507bf25f97cbe9732f61eb5d7a14a2dc8d2791a98fe83e31558ae7e8ca65e0b6782cc9db4ab0ac5fbf71e328923b3b0ed6fd7ef08e274b0c96ea7c2331d811b8faa249fc56370b7f2e4b3d51703d65031d3fa4018e2e2976a0d31cd6c29efe001dec9ec7e1ab3c5dda4e235c2fe6ee9683027ca50c6edaa73716ba74aafca5c0e9ebd2571cd65881f63a894390218f46b7085baddec98ca65413d90adb207ab5545fb64c55ac83fe809859ffbf9f886c270d1c9042a4cba7e9088280a962959bcb52a61b57fa184d76f341480457c6581481b7f9d1e6a6f6f20ab8cb14b893bc23fdf83ec4a5a6cb46ac8ca402f9455341baaf5f70da7649595187b74a9e79474055bc0808a710054633737b63b40d15cc595c492e9236a14188954acc478cebf4f78acf3203571352bc65b36998c501f2fccb118a0958b5479b0403503a7a3e62ff81df1172c0b351bca9dbd568521d1a4c76bac3e6c21753dd465512b9afe43f15f04573d1207695b834701b1b7a4f169edee1ec4549918c085d343bc7ae702c381e78ad5956809a99f8a482f84452e42ff94180164687057cb812358e3e4c9d0d05205b24aeb48ad1fc2646f796c7a06d7700f0b0fe1bb294904f856a69511cf791889ae48c90da16648af63c272ddc876119d7518ad25fa5043254ee32b1192feb10b03c52bdeaf770d197e3a2e11e61317a34e33cf6680fda2fd01d427a448b8990f4b28c152674ac8e89a3492f94f5f5728b05a37e6066f37e33331354b2ab7374940a1feeba5b69cc0ffe4e4fc6bdc948870dc8d0a67d4463eb73f46ca33329b9fd99151a218192eaa1e2d67c38dc724629a25d6f2f1fdf12bc235b94cd9231efc67b70c6e32810d190072c8843aac262ac29e234d0a8674327506aa9150646b10c04a63a390e8fe89dc3d50a49aa5b7293a6e73cd29710e6ce120c7d615c3bedeb26dbd88ea16b5095d3897d26b04823a426f6c6b7d385986ad7149f60080b19a1b3413829d3aa94ee3875741da9171010c08c2e85044aa63357920930aa3b3adac42bf53c2698927286432d0e3f9cf3ed026c7a154e9178d5c915d61ac9835396ce05234489f57d7925b1bb9af421b9364f4e1b2994345219d1781e1365cbd3b9567cf176d7fdd1e44b25631ea699675582eeec4c5744297f303c2bce320fbfbc3b45f7615862182e2fe3613c7efd9cc880d61cae3e7d78a2700ded0c6062f604fa2a4bd07888c925804e355541ce6045f3835df23c1a3db648427f98742a653b64a43e08de186bbbd278448f0e0e3e78d870c7145fcae4fc9f3da619649baa76d0561ab599b1c40f6188ef86f6a9feeff6e89945027c8c0d8c3f7d78a84f45aa8686c1ad890dd93f3fac8ab32205c9d8a43c557a889cc696725ae51927ad8d25f8d1189f06948d6a21f5840c8b5f78169c1f4566d8ae3bdf456d0b78853b0c392d2e26b74003fa7ae0a1dd06f1d73492c948f5cc273c6f178ae4c6f6092e39c641f6a1721a43ccc5be5a990a10f0d02399e1ebb1c14e2ba1acf089648496223ee2210dcf10f257783577111b45585f22860d8da456bb8dd708aec7bacde85380e07a3d10e21084da154491efa160ce1c8feb6d32dc8baf861cd468a718b5504c0f90ed1145d3466b64bd12b636ed9e01d88cde1adbb59afcc8e83cbd81e7f4f817d81e7749194a450e23f53566f7c3a2fb9b479fe7ec613de3ed883103790803ad644243793387682369a49029f547e5a0a94579c8d5a970bb49d31de284fd3b5b8d548ca71cbd5be89610f838bd97eeb0f33e3a09e70609a40f59c1a8b981cffeaad64c4dfa924ee673e134b549cb3a8a230577a8bf3dd80cb79b423cae5f74b7bd112c402f1082df9f95860e180f26d7e8c52e0cce33dc94416960d6297b8cfac14de05eeb4d1719126124f47b3ae5faa1492a8767b39b36bc5ff4254717d872e04a1891f7a0a831248eb9bc75bf1a733749a8e72d76c178a2d0fe14158167a78189791c290cd9671ea4fcb987abf5e6305fd695ad77445a430c305a5c85a4e952994e400ccd95c66417957eb81f50216abc4eb1f8b9f6e6211adbdbc9468d99af92802c6441d66e1beccc5125a739002f037f6feb540e2fc63299f2b436948cd7aa1eb149ade7e2f3694e6063336e6eb474da75b37c20dab47c1316f5f774f760ccb1e1ee3b39aaea2ca6d49cf467bb81765e62f7a5bc3d54ed9a9676d51d3ee2311029e4679b856c13641efaefca2bb7b4ea7dce24fd1ca064ee4716924e25215a058ceeec0f4cfa8cf6f1c4d0c350d371d46540fd7bbcb3356bf2b0f37044f0fa84e5b0b0b07318424502c39007c6937bb67ba31c559341a115f401feebd0567bee7693ed0c3a094043f50345290c943652387738515e84cff7a1896e41c354a0504b693302c65a4339654af03fec2768fcba550e9a556fd68ae150734f87483f4fa6236e8076d4271765ffcab200ac2bc6e980f9535dda3df28511d23e1872484b060b506b5944f40e6fcc40887c37bfa8178f9acee0f406daebb5c284d8a038e3398bc4eeda3e9b263d719177fde0ecd96c342d19250af96e3b1eaa3a6c720606df2e848abc9c5b364b26ba1736dec8201ec6e12d056f108b859ca38c284abaea7141b39bb8352937fb699fa8777bae2856def3f8f1923a7f1bd6039fcb0bd95a2d2f4131c8181f88fdf833b48699379a0f7338634bedb8e28260aefce7cf851eae2246c097167c32a5938e0fc90ed7d9809e2d60fc506a8c9040be62b172821ab3c06910dee9e7d3128b9c15d309fefad41ac096adf7c8ea80ebff79576d16b1cff33cac2cbedf399d6c38fcc959fe2ccd9a0c4e1b2e329822d3239555e6e9561c5fad2efc1529202ccf30dc3115fd6ebd62ba69554389039d1ba5c738921ff3160c31e666e0b6165be4d8f270b24d29eefb6465e13b5910dc5a86d64e3353b2cdff568868ecc3c54c5837d35e9828747abd990b07311a66d2b58d30b55bd90d520de3b3b19f3c62ff18f383683c5b7d5c73e9f138e60307efcfbb731595c2cd66018ceca5154dc7b46a0efacac7a32a01fcfac8140f261c3564747c8193297b461e153471c26070fd9f2c125d1f963a34cff48af7a36f23d301388093e7e4659c32a073c5b1d8941951a300c0a8d25c35cc9e96c0dbbcd2cc7f6479e8e24bb7fe385342a47c99bbef91636ed09c07cd595e5f397966c0ca07606abac5e2b06df2b6c97006ef46b2ce532d6a4804e9844d9ee2272e4bc9201f5b74645ea03d2416c066d55b46c211e793dce26c572d39e3ca0d6eb4f90b0ae939dfc62c58dec6306cde88567e7198fcc3d739c87df3b1813a4210821d9b15fdcd8fe32efb7fd5234827a23389581fc3e86efae36b1619db103ec0a87ab4d82b74ead33564b2942e441d493b86ab60b7f746091e09006632d00be71a7a12fc5df37576269289b07ec410938b70b1b7d49d8d2f60ff320d77a4157ef7d83d65fb944fc62dbffb171e88378e5cc1ece76a2b039e8bba53cf56ef7937890dd6347d7e633a4375f8906b4aec6ed70f04d705366ee0dc72fa80cce7e000db492e1fd9cdf12eec28f08b45a63b35bcdd306d763a1eaae27bf421c15a2e9cac48686bbbae20d3c7ffd12ba719f920d6b46ada28b02a9ca5311581fc0fc1fb038b0827ef4a832c5548ffe1d9bdbcf10c66e82c25c862f8deb5b483f93929c47a35c0ba496c458df5cd08e4e3b9e5bdd2dad2a054d58ca9f494885a2a58505bc3c6ca6ea122689926e21041c93a443d69104c9579bc3891f309feeeac4fb5f3b755893e54c46fb594d1bcecbbeb218337f87598a85859078d1e5dbf5a9d0b065bc404a7065f083db61a8a5f886ea886d5c59a2be21acd33dc779add77c872d8994db52ea00aacf8a73ac910cabd0bf7afb30ba5d8f3f4239fd9e4efababf6764dfea448303f8a580190c47de901c8f936c457d89b777f9ffb872eaf9a559f36fdbf5748166c9d33dc614cb1038703c4875372cf7f10da21611376e44ce7951d219f7250ee6b40c7df30114f2b3db34cf1e7742c7dba9129dd3f073ff2fef25c5c16e6edb338eae1f1bea415f3cd9b8f8655ea0cfcbe9c8af01473aac348d40ea29fdd816dd86826b75f102302ceb02bf33cc0ecb43f3a5cd59c31a12bc97b5f16025ea39f549185eb2ed61fe9e4300a0aa5b6568489ce4a5941964190e1a9b5a7b25c6fb535e0f37bb9b5021bb8d932605481bb70980b8dc3d8e5c07c43a28d2127551f1b940f38f84e8bf8997630564070cf61d787f28e667990ada0f23b2418ba83cdfc89cf1bf442968a05854053768a5f082e8c5477e4255a2509da4a3cabb215ef09db0f86eddd8552bef3027d5f106d9ada44e9713c656a3df0c11f2a60053c57c4e0985f2f732b9b36cc34a382cf51070d2694b2b4d36796adc1558cd33338b9b9d6396a02ba79c715075c4b1e17e75739528e80d58162128a3739476f1cd1d9d32014dd2fd2d415f9276bb5e30d63984f6840bdbddc4b263a2514fe02dc9011746b826f1d3ff9e7afec999ea66f15ed9cd9143f647c5c3ea258916bf67255bfd0587f74293854e695f4d68915f24cfc33eb254d4fc4051a0653c09ec94d8785ee6857ee80ab6beca39120688d7e757e46d5211c59e6a9509456b90b785c118f69308a7a233ce4caa96c256c12aa2099525ffd89db3798182c04093814056fd12727042069d08d4723fa916a91ec6f1d829729bdc26cbf10bdbc1417ded15961899f283feac9d1639eed8161a4a1fe1349c6d2ed2b98b94f67b6d2cd42aa294cb0d816026a0453584ecf5313047dbdae84186c29679b826b9c4af775b26eaf2a5e78386f1b90a93b02bbeda716fceea02fdd9e8f99a8878b9efb9d0805e1b1cd814ae3f27831a368a18c77176be16b67913634d4c75a48510a428c2df1056bbb1c36ffa95645213d9a711f3edbafaf9153ee7d5f7db9c1f111582b37724cc1a198892e4d44ae68a94080e2673b8e09d937f24d4a485a1fc0e028fc89118eb409da4ad33b32448fbcff1ade75df3831eba73c2ef79b095e8a15ee2368b7659d18e19c6326aec9378276b04554ba62f3fa985f875e3604ef4a7d435593b2b81b340b50078c37b85aa9095b0e066d3dca73773ee69fa4227f062329d72b1416444451043fdb2ac5469661a7766ccdd6c2160f4014394530bc68d2101a44585bdccddba44ff174307bc41643f443843936c2de469c978484f90ef9bb6407ffdc40309ba9bc85164d6d3374ee41be959c65af48e695d17c6566e1f14c8829fd863de79402eeda3177ca7d6fc9f5d18afb063de4c37fb0b17bce00f464e59e54ec527676615c858ef347882fbcaf1c20b3eb99e16b57cd22d5ea2a92bbaca82c51d323d619ac63ce78d8e465026d9dbd9240e7ba441dfb3306b1b1155ca0abf346dbd751576405920eca99cff4711ee22bc6c7727159a64e808615f5a710ef8dd075c9fcf5683464d7dedeb685fdba4193ea6eafa5c62320763ae21883bc0f959ede2c2cf6d1e0277356985454c8b030d5a038574bef61c6564fd8d64dad7dc4899983df5c73ed222e66b2aef010d8afcfcdc7e46c451dd464e46c3731d5b11304f1d0311c403712c94fc64eee18d7db1b8038a8944fb26228431f8c18bd9e3929d37599cbbd073708b2a2bc6e9d787bf2e973c8877f783639822f387169757b93a3cadf296eba5d5aa42e51b0eb24de2584baa74300916feb2056323380c1d5e779e653482928d1e1c94493a1d25e02d98017faae7cd55b45bcf93306dd3a5d0e3781073de3152dd920ac44e21ff45fcae8d0c2ee8d2d2824aecd5b5ed92a8478bf20f1ac3576e8af3e0d704ee8a66e357b1b3153769a0c49a3c546d623f332ec5b61e2af43f7c239f6d19069718ae449f66f39eb038e006e045c07e08871bc52d6598a5ddf2de2910d592ad4c963e7bb36c1b903218b2f7c88d394d71da0203bc93c8df94e26f93d3f06d464578d7d03faa120c02d31ff73b3e310b6ed213a80afba354b03be82379f22185c4a7650f717ec8e1d9b0b2bafaabb6cf5f2c331d1ebfed99ebd7601acf53e06a09e944d40e215980720c6ca754bde3280975cc676784aa03943cec7dd3585722cc63883ef58ab9230ca61a7b3d3fbd88418200fe97db1fbebd1884ce05c1b185b18c1aec4b177c59f86f453ad3e339e6e76cb3808f21642b7a72ab233449e7617639290528e2b42f1295072fad97be8fa5fb68c2bddae638976083777adb2ebfda2b2dc90ead5349a600548324c35db4a44e697c2b50bd77ce38d5ad31a3521b85dcfb4caf0c7f6bb35f2e88611ef455bc94a88182dc5ab1cf64d63b94a7b9cfaa245dd03d305e14111b0fc8c44019184b17b79fb1a0e85b220944aa51d49020a54faddd9ff40db337d273cfbfb4be87a78113b46d1fb76f68e62fc5b2f8ccf0e40d92221e5e97216e363bde306198ce131a769bea121c1864cfc88d6513ba69fa5550a18c31b77aa9ca2f92d4c45449ccd1747dfbd79816b6afced560fd9abaa4a360797059688acf4baf5d797494a87b02d8dc880b6d0dc91ec1cf023ff8e0419c399d56a4fb259444e5bf8e811e18e162c3714717809cfc6ebfcdee53562ce5525613926fb68713812884e52e34f5590fa962d32537f2ee2c66adaa9f88667ef65d2747803a4562d2203b47e419951a24d84cffa852c75b79803708e20e459ca8f6d82dc65d33f56200dfbd0e505fdd4de852af8082a2136e2aa189a69a6a24067d8e12606a5e1ec1a293389d3708fa91e20f7a9a92350eabcf200c6f5965fcbd2f00a0a05777e494a904a0d6a60ed3125340477a26c4f71de8c43f14a9ac757c35859822a5c888356f13a43e146e9d7d91d63545cf028b3aa44b1d87584b5674b33eb3aa89ab6cdc5e8ed94c176c087bac06dbcb0392b9f84db04bcb65b7e24d5fe0c608679d6ff87d29b800cf5186ab4ec5075c0791a67fb08c55b55b28c794bb1fd9c88573e3c12df68979c4e2f3d3c6bb9508a744c930511bcb3bc1db2c4094bba7fd8596b40a3f70dfbb101bb441f96ef24a929f479586415af1e9575cdfe01c357f91351846a250fa41d928f3687ab078cbdd252f2bd7f557f2ba8d2c87a7098f9afd5e8d0069db2a4f7b29a676bc97c1ae8075092bbee5eaed8b4b5465ca9d68bd897b0412400d8653137ddbf3952d4d340ac1cc3104def308b2ae166344cbff5066d8eff5addd1b034fe630f0b1f858b10024acf8ab214857c3a34ad0505574b0c1d9b491f66f096246e014f63bf0eb895c132ea81573a1629979b31eb84991ea4242c44aecf5c40c08b8af371f891b24ede86ad1aea78bade5e929a315928daeb094f028e9355cd87192dca77eeec40702dda57571d5a75b252b75610c47f3fb018ce5f483b49b1342302a4e4ff74906d94ec9ad0413d276f6d71a7bb88e3a8de71bb049077198a8d151b26e28361f4c4ddd274af6384d4339d4cd8d6cbc4d49548c0b692e796409ba363c6a3815df468f6a952e36c3929e1a1b7d57f4ddea335fea9c1007debbdc116a501b2391b032f0220269fc208bf77670f5b0af2676f013655a00e45c8487f41926c2b152bdef15ff010c5a1990906a31768dd46c72682189abe98148299be1ac97dc1340e4bb13a8736247a9fd8306c1959ebab4b03d2afc22c919c10ea0a6ac9110cc8fbc2b8d9f791e8dd0a756c6e3617c5187579b825a030fc086eae3a3faf238e03e3e4b5f49c28483f2fd797d991cac6a6f96fa92c2909d7220550b4fc8e0ca2c62b34dc4a08ef63fad3d16b95683c0bb04afe6b968d4733bc58265b76f1b8a285761f0cda0d310045baf9efa288f349daaad2dd0c63cb774267aad9fe1cded1d289c4841844e4eebc22b86a427ec5c7b2ba8cf27c40915d102ffa2b527800600691e880382b5426ae2e1c5c85071873e8476ba683da15374f6a067837452947a382feb293e30f23161c08a4b0f1b5d698f011345803a69f1b91f904e5c8be8ac8c100138e2f9463f2832e0ef03a40a419fac21250500f6ee8cb45bc0a8a4eb8657f98f7833bcbd812cae6e844d6d2852a38a84d8c6b4ea0a9eaa85340db724a4750a03d10cdfefcad0c5b2458e6f392605793d98f85b4f98bb084c997611c02be89ad9ddf61f263ea6ee64ff461c2c0eb9bce29bfc1813f64f6b7bd3917b2db1a3760bf83e5a18feb308c3633cbfbba98294070a528bb55505484a3daa581a299519b3f3d8afacb3659a38915cc71549f8642cfffadfacb3363e0ebb98d88e50e7500644d4c53a9c70c119073983121d01f170a6f6dd749b4c40eac96b900c3f9e52eac1fab6ba663259f7dd0653fabb71a8b83f554578f3b02750e553c7ad4a421223e85ef5c36ed43e04b630b71da32b09f4cb2140707e8450889939abf3063a92f9dea417c535af7d28408a103b1eedc37ddead3cb7897f1768fda4bc133adbca7a600b100c4f057455e663a3037deb6a88c9052b9a75e5392a7e6b51f33358b859db85acad1053ac8e72e14a0427e721600bfd20a7618577eb1717495bb978c5b65d89e929b3b3a14754e39d84bf6f532b57825605e2be3d0ea2d6ad0eacaa4b62260e586cc024f16db4111c43cbba9bb77e69bc259008053aebd3584d19e48ef08f156c1a9f5f2e41744222933666de74411a80ecf674af99b774114603d3e3b15704afd596297f1596f1a49a0713494bd9020fa016c5be65405565f8022cb52d533eea2670305a0fea50de462702ad0a997d36ab8a41c6a1cb4b0a807622fbd273606799f03dbeec7935a2691c7ef38d87936a4ded378d6e18721932493632e9204290c7b4837a9f40c87f1f559acb8ed90809dbc61b67cf49632f00777558ba0c1ba4e09c26e8968ce538f006f8104623088ed408d1734c8adc437c148378cbab3095f0612ba28e1abf400feffd48432e0f95d976d67901b1c11d860b8e6a4e0cb28a357191a0b50d9934ea421ef6ce8b09e767e75f7d2656e5e5c0bc090a8f177af830fb8b9b82498b2ce90fa222cb3168b989a47edfb47e599d30f1f6dde7936e0dbc99bfc61699070f2944bc4ebf43baa8619b74d6cfa3e680a75fa28561805b4ca1c69c78bbeb77d0fb3cd1ed38ddf2213efc45e13b9998054e1abaff3af5d8b60dbddf4c636caee755445a339bad893003c47cc25df19aad0b877dacfdabd9df4c2a3715b1627e415dc932253658317c9601e7ba57deeff682d1e62aa98b7ea8b2bb4da367da4a2e3f7caccd8232ef7990d689ee4f84042b56e982da7eadfdc23a29cf1039845c05da9aab0e8732230701b4229ad1f90a7d90004d03cffa5ad2b30a8e46ca9af20a3677040a2cfd5d3a483c9410350c3c43204c34837e73872ad61f7cd4063a9521490f4d4f0fd6b067f7aa0ab6f5570df4bda9f4d5479a110397a50e4f8b7d6872c3832f75a2645ca87c705ba46807665301b70157bda898c926ed252de85b6d5884af3fa683cc050d8a6cc1c2a518ef2f1ac323cbc2ba0925d9cfd3f40d72afdc06c09cadc4efcbe46575b49460a1eb114aefe112183715269aff6ed261f4cd5da8408a9df58717fd8aa1106b3aa170b2aef7db0170aeec78ecdeb540c4f5f65d03dd309bb5e530d52d9f93661666d567040bdc522f0d421f47c6f6e49ecc562b25d0fd7bfd3fd8dd41c2657ba28cbf6803dca106b2cd114c3326ae063016f41747ebf1f2c1b9bdefa25ba41897815864110d33120738142708449e8533380a48dd3e603929b0d89bcba58d0201f9d04789e2b1e390d101e73fb5e089cc0443dab8941d7c33405e944a56e6872436e887bc714ee2bdd8b3d6549dce204948448a480df2ecd0b66f29d4ad9da03442a55b7c006dd66172bf2a7a0422324d8973e79204a745eae3865c55f953e5b23cd8abb3f760bcfd93965e320ff9999b758915899341f44fda16bd35010ad7cd963e1346ef0f05b95e129a4e55e280b4efd721dbc1c684e59e8517851092ab110be67b4329d9c2f2d8bec5d65a5c6ebbf1229fa0b2c44ce334511cc49713fa9514741d997bf22a765ed12875c5bb2834bdb4b6531ba563fafb89d3c7725c55556e53d7a8ba4e5142dd793df41e75489e57bae569c438f7d702258317f45458d5be7df64f6f527ba6e7e797297602826343a37ea281d8692c377596d0abe00f568fb4077f2a733fa4ea36d7a273d589d5352702d65ec2bae7a18c9ee71f9ffa03206803977987dec58bab38c067b80b78116d95f66accc3e5f5cef4abeaae3cc5f9c3269041d23a7673cc90c3f5abdda20be35febc5dad25c1b17e64104728e8995bbf1b3e9cf8787486537bb3604fa0a25f85962d7f0dc2b5d3db5732eca121d01f414ed1243a02f53d15c2734f59e6b0b2ec70d6ff0d9ca2d1660ec1b6e3099dc80ac7c31335c3295151b55f8813f7e9eb95e2962c17ecd01697b38921c43415ffed85b04b12721cf929e14edcc4a214894d772f2bae5f0275f95efdd844ad6fbd4df2f37bbf58828a6c6ac0cfaac41d6982015cf5b82ea78c7e6c92580f037dc440e5177595c8933d5d2efce6c974bdee857f2d1a8e3cbc4efa8d79e3d7315aebc21d339eb768fd35f8af01ac22b399c8017bb7a2b4fb5be55950223fedea621d94169e41554f291d6a984218b66b68b091f28d23104b9d4ef0ee034766ef75a90e63b04b0598281944dc078328ca497ab16c095e8ea024f3a2346e3ba2fd45e5cc1cc0fe0913afac0bb108b0636381486870e8a40debaf0cb06b1270ccc6c2b9ae6c86f69ea00b3ea07f5df2a4151e539d5b72ec75dcf6a0b55b2d93aba7649a5bef3aada28753a7603b83f1a29a8b15143f4fdf9806a49deab8e0be7aebd66af05aaa534fbacfba2ac4f6662dae46301948465c78a1731e216280142d1eed999b696faed3bb3f55f5c752cbdf033a33ec7729aae612c200ead73d00e9b160ffc3f7f6046f900503805cd4f5d2120494c4d28d66bca084d3f86fd07fbc343596fe21ca85b01f0056d27bd9e9130a600fa6f46e631f290cf0c943b6e4eeff9a26d7d108123fe6115eb9afb6d552ba9a5758b5d803b124db5808ad34721f66fd10b1ff4684ab22d2d13d037e1e0a0ab978fd9fc5eef3ee1391ef9ac0d1fb0c51a7966a2d2db82bd48901f993ad8735df144272470701b28da1317c1d1fbb47ea96cbd85e537b34651bebc78a8948717a9800b048fd6452540edbe0e0bf5cb5110f9fd3c6e3ea514caa9fbba09a4cedd7247f917b392a896ba1baf7444a56643e8ce6afc05b20799e8d3787a0df370c111dace2121f11e624bc428a26d68a95f1d390c4fd9a4942fba22b37cb38e875a64599c43c604104c79dded2fe434f228011f7e0ab920bd97d95d1cc4702439f5c413b99a5bcbcf735bb8736a6f5585ec5e97b7d5214157686aad26065e5ba7a25fcf61cd4e45cef801f8690afa27d2a30ba9f418d682ac0b6bc80f266c2c856b21707b9025611c92fc561a7686c6494cf9039e7a92650bfd6b55e888f36862f1fe509491c9869a889cbcd81d2aa421ea44ec5a87331a88b1a9278c231de077580c69513aae44e0d6a129f14bdc258c696766d9a65c2c0e03895d23ae3c11ca4e50ca9ffcd7262097030a1da03b7a7f5a70aa2a39705dc168fd4a0f63443e5ccdcfc5820b194c932265bb4a93efb4d1442cdf11395f4e4dc3d1186acc943f9354bddc8dcb5d7d5077aaf1db70f774243a98b243cda4efc7050648927548a2262fc7331c6908dfc37b47e541dc3f21f03e8c59b03006cc34b33ba5711e0bb6584fc78f1d6758ae8656c01bc8630357002aaf25895e0ee74b24c7244a427c7f82f8d6683b3d50c115154c2d9009912321f875c89ee827fbbd64288d19a12132dd8ff53a8176ddedb0f240a5e2ae9632374d5a2f55ec86ad3a21f28dd2d108e86c2a24cce9139d0f1fa68efe86799f890e7eee02d80a94e89b578ce327bef73cf7436e57a5f48ccf8b367df52f146221974d4c043c0a996dec4901378d7bf2f84c651ef377cddf2b7e2bbfc7e3d2f146b5dfdc209399e2ab1bc95674cc4b1a5c086248e5a99856361ed1c4f68027c82b26db61d404ceaefb34c0a45b88c1253152b23027afe54a07dff4eb6b6298eb5523da17a56d6c85edbe19a7debec459e5a02aa7b887375225ba076519168e9490948708e91c36a9922680ee42d92469434a3e9cc5269f964d79b2d65b581503729486de2b7c2f3c3b98c87be053b82087a8ea3e5568427cbdf9f2a75f63f37308e4f8b1dbea71119e19114be40a8e51b1ab6b9599486676df052a3162a1d61d3d907250ab8d4b1a02a78b04d4c25d31c2d614a7d3220444d2f8768ee7e4ae19292a9e104843e45509bf1722e40d37b002ada8e1304d3341cb587b063c53c62d4180198835b9deeaea720228718afc4230eb1081f1f3aefc99b65ee8fef9c1c7dfd1a1f30bff1308860d6a441181ea3abf1107d1aacf241f96039b12101c9081edef500916e11494d323904bb87890c2461d0df43ec66058412084d067b2f72c0235d597fce21048bc3c80f41853d7f5aa45b2cacb2ddf9766a24fb0d57df56bf8fa75a08b7eab3392e1877b6649f3e69ce3e55b4070d281a6d316031a09c4dd847339655a56609c2dbcbfa35e1e1e68f5f4dcacda592ce88955f5caa5c5bbf85d09bef459a68dabef9133b7ea42cec615a5ad911cb4f44ee76da757802c38b7473468d963e4ac9b0e341718194dfca3e024f5cc855ebe3808e0177468f56593f6934b95500292f8846c25521a5175018f755886782419d24337a9bdd555db198c6c4bdd6b26fd9706be6cc26034d8a6fdfcd7a7fc031527eee05512a31a51f21d46411d09d9b513577d3f20a45b4798c553f7a0df77051e2b4ab1f07068ae3091a7c78014bd934bae6cdeae797f91a2cfa51cb22b411e8c1afcac900b45573094486f43c3bb661ae67e3014c41254585475692b8ac27271e639d8a8c6de60c9d59faa84d09c603d1acb2642920d58bc4c2648e7a359033a38d28ee2674024555b1fa2b331e] */
