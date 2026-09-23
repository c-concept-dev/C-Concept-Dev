# Manifeste de release — Atelier Prompts

> Ce document est **documentaire**. Aucun code de production ne le lit, il ne
> décide de rien. Il constate ce que contient l'artefact local à un instant
> donné, pour qu'une publication ultérieure sache exactement ce qu'elle publie.
>
> Régénérer avec `node tools/build-release-manifest.mjs --tests=<N>`.
> Tout y est calculé, sauf les deux observations signalées comme telles.

## Identité

| Champ | Valeur |
| --- | --- |
| Lot | HTML-FINAL-02 |
| Artefact | Atelier de prompts — V11.5 LOT 10G Adaptive Decision Pipeline |
| Commit local | `7c0c7eef166ffd279dbe592669ddc94ab396984c` |
| Date du commit | 2026-09-23T20:03:59Z |

## Artefact canonique

Un seul HTML est servi. Il est autonome : aucun script, aucune feuille de style,
aucune police et aucune image ne sont chargés depuis un tiers.

| Champ | Valeur |
| --- | --- |
| Chemin | `atelier-prompts-v11.5-lot10g-decision-provider.html` |
| Taille | 1663868 octets |
| SHA-256 | `46fb0c10cabfa85c6e52ace90413b06ec750372b9320666037f8e16002cbbdb3` |

## Runtime compilé

Le bloc embarqué dans la page et le fichier généré sont comparés octet pour octet.

| Champ | Valeur |
| --- | --- |
| Fichier | `core/adn/browser-runtime.generated.js` |
| SHA-256 du fichier | `e9f913592815ee7ea032f75a46c6ed32b16c293ff097cc1db48ad5092f52fe8a` |
| SHA-256 du bloc embarqué | `e9f913592815ee7ea032f75a46c6ed32b16c293ff097cc1db48ad5092f52fe8a` |
| Identiques | oui |
| Blocs de runtime dans la page | 1 |
| Empreinte des sources compilées | `76cfb86e6701cd69b80f843d9e0ab34250cb3da2cb3c8cc825ea9303955babd2` |

## Plages gelées

| Plage | SHA-256 |
| --- | --- |
| moteur Rapide | `3725f2c9335cb176084cf62c51472b5f02a1faa5bed496c424954c841a689664` |
| moteur Architecte | `8668de58c928afaf010d37aa3b3f1c57a280f32e916cf483ad100c2784debc39` |
| moteur Atelier | `8c3511538a96d4be3953270c4a5463da6b8d4807187a0b7d4b1c31c0e4589802` |
| FORMATS | `f4c9f1da5a14ecbe28d3cd0853871aa621909360ab6475bebeb76bc2191e141b` |
| VERROUS | `0019d7e26efab37164b435667d89494135cc4ae7f9f8206e95472435d1dd63ff` |
| ARCH_SYSTEM | `7fc7b736f6b80049c42a39d74a0fae76eee26d9e2af8249c7761de1ec3236317` |
| ARCH_SCHEMA | `a976687cf6412be80f74eac88762f8c4a4115fe30697bdefd0ea5e6e318fd84b` |

## Jeu de release

339 fichiers. C'est ce qui doit exister pour **servir** la page,
**redéployer** les workers qui la soutiennent, et **reconstruire puis vérifier**
l'artefact. Le manifeste lui-même en est exclu : un document ne peut pas contenir
sa propre empreinte.

| Empreinte du jeu | `e98ad2222ce95525dd219be0bc1977cfd7ba97d41b30c0321b9608114b14a195` |
| --- | --- |

| Classe | Fichier | SHA-256 |
| --- | --- | --- |
| REQUIRED_BUILD | `anti-regression-baseline.json` | `50fa51876930feeace1e8cb1fa40512a629f59692f075060f3da7849a32a0719` |
| REQUIRED_HTML | `atelier-prompts-v11.5-lot10g-decision-provider.html` | `46fb0c10cabfa85c6e52ace90413b06ec750372b9320666037f8e16002cbbdb3` |
| REQUIRED_BUILD | `core/adn/adaptive-lock-selector.js` | `15d3154d639b761747a26215f2ec59eb6b121e6072187b6a2dd611eefe5b65ea` |
| REQUIRED_BUILD | `core/adn/adn-state.js` | `814bbc8318cd2e20d1964c0930809e9997e00bf1cfe8f474aa8f3f39af767d8b` |
| REQUIRED_BUILD | `core/adn/arch-canonical-enrichment.js` | `159140c46266a8fe6cb35995f53addbfb8fe9802b6ef427d3c0589c449cc0aaa` |
| REQUIRED_BUILD | `core/adn/browser-runtime.generated.js` | `e9f913592815ee7ea032f75a46c6ed32b16c293ff097cc1db48ad5092f52fe8a` |
| REQUIRED_BUILD | `core/adn/engine-adapters.js` | `81e206b5bb1705c404a494dd136fea1fd17bb7cd502aca2855b6bf6f9b161255` |
| REQUIRED_BUILD | `core/adn/execution-lifecycle.js` | `accdee01c6c294f33e28be321024501c152e2fdd6e53298575c2450adebf8ec7` |
| REQUIRED_BUILD | `core/adn/execution-readiness.js` | `c6aef9daf228e441ad96545ed036c45955d8a46a8fcaf8f387f4a3196132ffb6` |
| REQUIRED_BUILD | `core/adn/index.js` | `83897c9958d4102243efdd180e43872c91df20104884cbffe8a4c9c621056513` |
| REQUIRED_BUILD | `core/adn/intent-preservation.js` | `9e3dfcc8acecd0169e2f3238fa2feb07199d6652394cfbf6e00b390e3f890484` |
| REQUIRED_BUILD | `core/adn/mode-contracts.js` | `3c8c7f414213166b1790674e9195cf072c73eb427ddac37f9a51399167149359` |
| REQUIRED_BUILD | `core/adn/operational-request-state.js` | `981215fe0dd6bb7941c954a3a2311c0469d0cfea794fde15f32c4a184733aee3` |
| REQUIRED_BUILD | `core/adn/oprie-canonical-mapping.js` | `b700e24abffd6e04efbc06658d8c4044ed60e9ec650056ff33c065ee07914f59` |
| REQUIRED_BUILD | `core/adn/oprie-manual-roundtrip.js` | `34eaf03a4b68a6932f5a7a5767d3a3e4c8a9c1e335539f88372c7510ae1042af` |
| REQUIRED_BUILD | `core/adn/orchestration-policy.js` | `53007469046156d821085862cc1264d18c196681206a0cb0ee92041de5340dc1` |
| REQUIRED_BUILD | `core/adn/output-compliance-gate.js` | `182ec76d44014121dbfba67d3442131fc4c525ce9989eb4948cb5f82c16466e2` |
| REQUIRED_BUILD | `core/adn/prompt-contract-gate.js` | `49a31369b431ab8d93007a6ddc4a9acd0d9923145bf4c076b1cb3d179a56d1b8` |
| REQUIRED_BUILD | `core/adn/rapide-canonical-enrichment.js` | `f40a80b2afa34fb74cdf83a13e0ec450d342b80839e58dd5662da29f2dc93a39` |
| REQUIRED_BUILD | `core/adn/routing-engine.js` | `529a73614a5ebf8262367bb1b2facc3fcedd40df73bd6c4ed16048a825a9930c` |
| REQUIRED_RUNTIME | `core/documents/reader.js` | `61ba7f99ec881333c00317a5bdc92fd56bb89ad6d856b01ce33ed5436999e009` |
| REQUIRED_RUNTIME | `core/documents/vendor/fflate-LICENSE` | `0a1df3a083d0c010560aa342e87959c8c1070e6fd54545741f083f22d0c8b551` |
| REQUIRED_RUNTIME | `core/documents/vendor/fflate.mjs` | `b7ca4450b19559a1d50eb381adcee94b82449674be4cd17789d9beba7e6122a1` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/LICENSE` | `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/78-EUC-H.bcmap` | `d92a261336dc18b8c03a46eb4d462382d33f4338fa195d303256b2031434c874` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/78-EUC-V.bcmap` | `61670bebc4e4827b67230c054fd0d820d6e30c3584d02e386804e62bbedc032a` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/78-H.bcmap` | `ece6415b853d61e1b2560165151407d35cf16e6556932b85a13ea75276b77402` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/78-RKSJ-H.bcmap` | `696b1f973c97623496703809eaaa5f9b40696c77540057413f4b826a08edfa7b` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/78-RKSJ-V.bcmap` | `53cb6d560ab377da48cf65d6dcacb0bdb31f13fab7066c580de38c12a73a7ff9` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/78-V.bcmap` | `289000f02fd34872b6975503217f33abae6bee676e7d28f640473a67c8db1712` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/78ms-RKSJ-H.bcmap` | `a2442595218f5f8bd8e1b42188e368587d876cfe0cc4cd87196f077c878f72e2` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/78ms-RKSJ-V.bcmap` | `f8ddceba96bfd9d3740bd1789ee30d1f47c78371520a8084f71f7df58f19be0b` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/83pv-RKSJ-H.bcmap` | `44040051ec818fe09b9703472bea72efd2759d5eeb5ff0d77c718d6bb5e6d1df` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/90ms-RKSJ-H.bcmap` | `c13e043e85ff715b75bb03801e8fd0fb8f3a75e4a48496faa6baaf92b5b48ba1` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/90ms-RKSJ-V.bcmap` | `499bb916ce1adbe4289b6e5811f4dc20eb238cdc2ffad20cf26ae56716885bab` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/90msp-RKSJ-H.bcmap` | `7b8b3b8bbf821702e9a4df9f3596ce292380c8c1b0925dedadbb4e4b2d80498b` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/90msp-RKSJ-V.bcmap` | `6296c2b5c07dca8128e96d5296d621a3268803d4fa0e5812a21e52fe2802aacb` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/90pv-RKSJ-H.bcmap` | `fb5103f03d3a34547e18d316e52b6d9b26e485c662999222f84d2ba54c2e4fa8` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/90pv-RKSJ-V.bcmap` | `7bcb5ad2ba55b9662ce379e16c2d9cc2b82d621a579807353741172e4af615c2` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Add-H.bcmap` | `a2ffab28b990998181bcca9b0e914bb2207820f100ae31d5c469444892e5ad8e` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Add-RKSJ-H.bcmap` | `b29f4b52e2465d0485856d5e69f1ba69927deb2848d8fd328c8035583b35bb7e` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Add-RKSJ-V.bcmap` | `2aa2232c283a3f5d0997c2834a36cead0b79ce2657944cfeed08140c293460ff` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Add-V.bcmap` | `25125d3b1be64e86b2df5b3344170b45a42bcaa0b46e43a34314ef73c166e542` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-CNS1-0.bcmap` | `8c65be9d51a9f269a547dc12460707aaf4031ab67ebe8a2900f4b4cc6b3e450e` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-CNS1-1.bcmap` | `73152bc1a59cc594b414ac6068be48e5512b96ae85920c40e32a99269fdb0c04` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-CNS1-2.bcmap` | `a1b8d353bdef9584c820464e8f1c9e2013d64ebf433cba0aa831dddf515818c2` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-CNS1-3.bcmap` | `2ffc0c75c79fafde506163d3c08c390d183251009f3fbf6ae50d1167d14b9570` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-CNS1-4.bcmap` | `98a1f470c878c6b9691a4d7aef776af8ac9b55f5587c9fafa00547f3bf655716` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-CNS1-5.bcmap` | `ddd6e29955eb8cb545f2ebd09c628c3bbda5023256eda1b728f743c75fb77829` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-CNS1-6.bcmap` | `317bb2db71e0e5b7b0c47b75de1da915c2e22f65f0c0861507f9ca7ba238f8a2` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-CNS1-UCS2.bcmap` | `e665837f2197c6bd08cd8955ad4d6932cee2398e2e328b25b00e6bfb3bd72af9` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-GB1-0.bcmap` | `8b81cce8a11d510e505704953cfa4e4ab080c1a0cab991145a3512ee433946b9` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-GB1-1.bcmap` | `0426983081788ec7202703e71f1efa4b860f75b936994236010b39d89251a81e` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-GB1-2.bcmap` | `e67b37a83b160ab3831306a71a605893b24454ee81ac9b6123bf2d3984d268d5` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-GB1-3.bcmap` | `aa299afc3e12a28726147305f191be28c7498078c8b182ece7886ac79cd99078` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-GB1-4.bcmap` | `8fbd7d74c2ddb1350c1cecce54a73fde3f5453093d4bed445283ec0033d2097f` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-GB1-5.bcmap` | `c22cb2fcff24112fa31dab2111bdc51957006576d31aad5a25e67793ac01428c` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-GB1-UCS2.bcmap` | `20507620260c0c935c35afc1e70e5888aa7125d5ec7ffc03cef1959feb2c1641` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-Japan1-0.bcmap` | `464f08905236f5703b1f5cf8358767c8b18e6bcc808840d081f1de2c7ab38134` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-Japan1-1.bcmap` | `4c823848722187d1ffe75ae3f5f9126ccd2d7895a05fad14c919fb119e037008` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-Japan1-2.bcmap` | `7810fb808e367e70429e90a9478fe6a3fdc3e214f25c7582ce9c2da6a242315c` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-Japan1-3.bcmap` | `84deb1828711ad3d390c9899c38abce1bf619d65ff7bf1a326ec95acc45f08f8` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-Japan1-4.bcmap` | `3f8a4f974919c2b8bae5d10175ffa2673be140481e00840542c85d48ef184067` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-Japan1-5.bcmap` | `1d3ce4ff28d977f8cf37a912ae4ec811f4175c3167b1ec0b2567feec3e79e1db` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-Japan1-6.bcmap` | `5609797b9401b30be72ef9645da62a87829f058c3be4b5c623383119f584b1d9` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-Japan1-UCS2.bcmap` | `66c5d0dc4964f4093e77b194023f3a0f689324028ec8330e1e1d0570bcba7c2f` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-Korea1-0.bcmap` | `dfb8c3874f0e5a8c3acf597d2c12d2b63e90bc5e4f0fce990ec4c56077d80b32` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-Korea1-1.bcmap` | `62f277b7b1c441c007797ae707d5c37258d029ce4661a2b911e2e1ee35e6adc1` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-Korea1-2.bcmap` | `1d77068af462f96d7ad28ad7e7d43eef6423c685b479d7dc25ff5df38db0380d` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Adobe-Korea1-UCS2.bcmap` | `857b723088be97255053562bfa41bd1075a7f7910d3bab59a0645c8bbc7060ff` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/B5-H.bcmap` | `718ad0ffbef4c34f8f3f31292c462e519cd567a5511fc8b346c60010d64f4ef9` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/B5-V.bcmap` | `b5c37383517477620ced927b6b4ffd4f4cc6230d8051b5b46a21d6768e07f7d8` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/B5pc-H.bcmap` | `bab6028aead1d6149400e904ab10cfd319082d826473ed4c582c8eeed920f17e` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/B5pc-V.bcmap` | `41543142b9767f3b76133899fc8453282b01ad3c653acaeea42d78c5a7d08c63` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/CNS-EUC-H.bcmap` | `e8f89cd61e6486b948205da46499d659ed0aed949b7095fd3c8e95ffe2b0e7a9` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/CNS-EUC-V.bcmap` | `cae422bec2ac6dbe86bf921cec942bacd2d0b733ffcca5f91b3ba14e917025a0` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/CNS1-H.bcmap` | `e8487971ab20cd16f3de3e8ac56ec994b72b658ad113f2818239dfd5108f501a` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/CNS1-V.bcmap` | `42df8076aaa7574505e7304af83a3323ec032c4177d64b1309db8c043d594a8a` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/CNS2-H.bcmap` | `bc6024d274d440f0625c69e25f37036ef6cb6689432ceaa160d3432a2a716ca7` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/CNS2-V.bcmap` | `2e4f70a8afd23a121030fc2e5b5f3816e903b11e7ba8b8c09654b31c80399c38` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/ETHK-B5-H.bcmap` | `d2f10fa519336bc4efcc7b6deb9604b75429946b40d82e311cb3a97a1994c89a` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/ETHK-B5-V.bcmap` | `1fea3fd0d9f0f679f80505800851ef2e4131d81127e18c006938ffa2f4c8b247` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/ETen-B5-H.bcmap` | `87ee6b3f5bfda5fe26fa35431264c7d73070d10dbbf398a75185d63ae322c18d` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/ETen-B5-V.bcmap` | `47dc0d2c21e3bde317947aec1675ceabc1d5460a60bf9c24334b8c407a17172c` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/ETenms-B5-H.bcmap` | `d5f5a73da4173b7da9a3a20e16f26f9cd5d12deb1553409919e0cec6fd37fdee` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/ETenms-B5-V.bcmap` | `18252fca90f472f479af1bddd60d6ab51c8e1b55dcf6845951426504934543e0` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/EUC-H.bcmap` | `f9939cd57fccdc65c5d9f4c205fd497ebdbd283643308da5663801a8c1d9c595` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/EUC-V.bcmap` | `1283a50a706507c4436da83ede9ad7a4440be25378f2e96f6c81a430081426a3` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Ext-H.bcmap` | `4000ed4e61a1c668ef453bbd0603cfa383defa793abd46a57ed870d7f527350b` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Ext-RKSJ-H.bcmap` | `e0d2f0df337660e73813238dd4a725f11f0621b90f3273857db253d0e7694caa` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Ext-RKSJ-V.bcmap` | `f617a22b6d67febb187990952006c91a9f5a4db21155d268c656252d0c21985d` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Ext-V.bcmap` | `c2087fb845a9e3acea0c2922cd40e6af67e11957bec74dcd597f1285edd490ce` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GB-EUC-H.bcmap` | `928bad06fd84a48f5ba7150d7716609119fb660f2aaa73eccad81ddab9b9d203` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GB-EUC-V.bcmap` | `a9ad88ac2479da529b16dc48abc5952332e27bc355335f91df5729a587533324` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GB-H.bcmap` | `1018c777a8910b5bb46d7d54a4aee9d51ca5cff8addb2b41c969d9101cb3fd1c` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GB-V.bcmap` | `0b96789143c0bbf9f1641ae7165b3456dccd14dabffcbb0bd654d5bf6f94f863` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBK-EUC-H.bcmap` | `2103fed28650ede096a2281104a1a8a4304dae0db414342c636867522307123b` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBK-EUC-V.bcmap` | `a7fd35dd14d9dbdb955f34e6c0630618b6620dfd09d4283b2f65a65ce77fcaea` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBK2K-H.bcmap` | `3d919ae72af16c5cc6846ec87a4326a9f125e493c59d3628429d35c2c95fe8c4` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBK2K-V.bcmap` | `b927fdfd595c07ce9158bf2ec13f4641b2e83b01c70989dadfabd6ed7c6ac2dc` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBKp-EUC-H.bcmap` | `d15ebd8e81fb4fe8a244f1b1e877922e03500ac69eddf5001093e502430451d2` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBKp-EUC-V.bcmap` | `fdc736d46e642625dccc8ad8c59f2c69fc7db7a13f2e799c6c6b779e707bb97a` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBT-EUC-H.bcmap` | `dc5f44e48a39f3367ae28665027d8ab1d8cedb5a9dcc5068a900acd6709f60f9` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBT-EUC-V.bcmap` | `a1ad24e63653b8aa388c18fa5e498f007564e43dde699a9f91ccb4645c999be8` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBT-H.bcmap` | `8afda745a505763f3ff54c8126eeb48ef376ea9ed07d9f42ff9a22c5c547ec57` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBT-V.bcmap` | `cdc2ec5c3c7c7033290c9a8894878202f08674eb9b1ae7d36218430326768771` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBTpc-EUC-H.bcmap` | `7b23e2f7bfdb6c918f567b7324bf858f398bd8cd5f268d74ece19a3c91bf4f32` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBTpc-EUC-V.bcmap` | `d7a1b13ead9ab511cf2cd01de6ce8b02aa8e8767e84895337d7a3b67f039f93b` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBpc-EUC-H.bcmap` | `3c4a4eb82f05abe51f6650985c630e180438bfdd491318f5d20d2ec29236e1c3` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/GBpc-EUC-V.bcmap` | `215bdfa2842705624b4cf4cd29b8e3c720f1e192365e0305c11030a424c84d7c` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/H.bcmap` | `a0233e21047ec00b852125b243cbcf30abee511155b6d8159c24f944384bc9ee` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/HKdla-B5-H.bcmap` | `5242bce18fb13ab4cc59b146a03eba36e4ce42667eeff09e10981a9d2aa4996b` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/HKdla-B5-V.bcmap` | `2e0537f786c0791d41a925f72bad2d4e7268aa6cbf15a1400a722672cec38e2c` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/HKdlb-B5-H.bcmap` | `fdc8159984bf5dbe475c0d5dfcb621ecee4dea07c38c668bd77f4c679e23b9b3` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/HKdlb-B5-V.bcmap` | `b249eb9dcb915ab45057c5d4d7aa55ef88d0efbb092af6bae0b2d4705d139abf` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/HKgccs-B5-H.bcmap` | `ab64c7fc5e9b2e97750cc4f269b0da14fd8649e49151b7598c8df86599bac591` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/HKgccs-B5-V.bcmap` | `02ebdf7cdffb5395fb21091cd58a013a18ae5388922822f9dc6292ef16b98956` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/HKm314-B5-H.bcmap` | `bfd8bbde6b36a9da4c1c902c74121a30d9807a7079a00eeea218be6adc223cef` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/HKm314-B5-V.bcmap` | `2a64a815cfb6fdd480674a868762e3d161fda17543b20c9209978559f0667164` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/HKm471-B5-H.bcmap` | `49d7c037758826b5b6c0fa329c35bbf25d3943197754e72ecd30c6fb04d745e6` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/HKm471-B5-V.bcmap` | `be24c109e78aa4fe3c1f27d30aab3ed0741e783fa1b6b6c2719741072b54b132` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/HKscs-B5-H.bcmap` | `08599378f41d96b40537adef6e6edcc4a787bc63f5accf47c026df4905a13914` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/HKscs-B5-V.bcmap` | `d073542b7dad1c4cbf01c1af5f0cd13218d1281a491956e310c55702fc8705c4` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Hankaku.bcmap` | `b454701f7aecd7856769016dfd04ca64280a060f2c67a2466d50b4395d24974e` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Hiragana.bcmap` | `2ed669394756dd9458651cd9995ab29ab691ecb7686659003306cdf22767a414` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/KSC-EUC-H.bcmap` | `6784e16dbc5861c036c23d3e55f0d4ba0975a3e464da0ee8e49bcfff0be070c4` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/KSC-EUC-V.bcmap` | `fdb36bad85e9924823d49db374067988e024cf80fc894711f2c9178951cbbe95` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/KSC-H.bcmap` | `c1f6d61f1d3304fd539a65ae72624fa567ecc3853bf52e283958a7a2515b3eee` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/KSC-Johab-H.bcmap` | `939993d213f68db763bf156217c217ae23af082b91a0eacecf3d11eb4ff8ef8c` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/KSC-Johab-V.bcmap` | `5d61967aac0e666def721e8b8d0fed8f95a879a14f2e76ce516c3d11c621e519` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/KSC-V.bcmap` | `d7da5afd9f1fe74816d79c9325f0139a4efb6438664ebfdf9a7aa92f3034360f` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/KSCms-UHC-H.bcmap` | `5b70d8f6a4fa9e2283dc649f0ff95d906d56efbee50a20e8d2faec3a8fed078e` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/KSCms-UHC-HW-H.bcmap` | `a5e6ba22aceb02fdedee11bfb9ed138463d89e85b87810b9f075b469d936f8ec` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/KSCms-UHC-HW-V.bcmap` | `890332a6a26880d463a12f2a6ff048bf9cf7e45077cfb1ca8815b89baa7bf411` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/KSCms-UHC-V.bcmap` | `1631b531c9a40c8cbe24c2317dba107362e49fa6e18af620414d627c111d570c` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/KSCpc-EUC-H.bcmap` | `709480682c55cedbb0124b9960d78e28febeee0df2e34607d61aac6601647ec7` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/KSCpc-EUC-V.bcmap` | `031707887d6fc2378a36cdb6775334fd7a236c3f95048d8436abf43fe26fc49d` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Katakana.bcmap` | `3b6ca6642fbf8822da00d5e58a8aa275216d5c32dbf2bd73e934197fc9fc5c53` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/LICENSE` | `aa92ab5a472974865a96fd4a4e9c13bb41bf6fe1b309cb6b8da48bc9e19839a2` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/NWP-H.bcmap` | `286c6c9e335da330928a01edc3c97a3a623f1f7f3c42762b0a7dc2f651b1a78f` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/NWP-V.bcmap` | `3a75fb7b59adfb172710758c425d8ac6c93fd5360a64dd4afd5dd04e60ab4b4d` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/RKSJ-H.bcmap` | `a70de61a22a898f693f02cc011c3e3cff2e10aaa7cddb4661e456a21ae859f78` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/RKSJ-V.bcmap` | `68c1a64506471a524ea5cfc3b3a9f8f70031989a6bd95427b1351f33ccf50b06` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/Roman.bcmap` | `1c6b3ef9d9e5cb1aa329142ce9414b90f9b6d7f9182a2a9e927378dab8f0d43f` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniCNS-UCS2-H.bcmap` | `779428116752f34e2490a1941d24e4634c71e3c22d053b811d2090ae2fb3c704` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniCNS-UCS2-V.bcmap` | `1e5cc184b850ea44abc2df8ae5674279df668e8edf5e2a1a2ea2bd77adbd280f` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniCNS-UTF16-H.bcmap` | `32ff139b3c7b91d6ad25f994701f3ce7b242906022c418fd73e6493fc228bfe5` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniCNS-UTF16-V.bcmap` | `278eb1e68d1a236c60ef59472cf0176ee0d45f364285e76ca12419a08d46fb9a` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniCNS-UTF32-H.bcmap` | `bf26eb67fe19ee5ba915799e80ca72408400aa8342fdf6a244a4f44de8f97336` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniCNS-UTF32-V.bcmap` | `f7da3caf83ceb1cb37936fa10700d9ba6e9c3f72c5bc9724e3ac79bff0c0179e` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniCNS-UTF8-H.bcmap` | `2f2a742bcd1a84a148a4a518b9eed51a8f9c6ca5ed3bc5e2e41fff97de5dc2d8` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniCNS-UTF8-V.bcmap` | `b7c3f10780a8c62dd1c8ff6c30dc1e4e23b6cdc87c3a96fcd514cc98ffd3af9d` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniGB-UCS2-H.bcmap` | `9201569b402e81ad8860650bd86350c4fa28e5dd5971f05fcacaf40f51de18ed` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniGB-UCS2-V.bcmap` | `f10282335e4d64203bc2a653a3a47d745ec76c8ae04549f4d50180c1899be216` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniGB-UTF16-H.bcmap` | `386fd39581245c034da016a92d23f3df1117d169f996100050b264fc09a84e35` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniGB-UTF16-V.bcmap` | `0473cfbba612b92dd9918f0ff8aee9112897c48e0ffdc0eb82da3144ed8ea84a` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniGB-UTF32-H.bcmap` | `f48a145dc4e3ed1dca1dde7111716a72306a2a4191ab05c6bae3a5c3a961cd2f` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniGB-UTF32-V.bcmap` | `106acc49b7118bdef944e32107b4f348238f3929a0a15d3b7aab7b9101535993` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniGB-UTF8-H.bcmap` | `f217b439c80ee5fa1bc2cf6d1defcc319f8d84483d166a00ee199e05a68588df` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniGB-UTF8-V.bcmap` | `a64df947632878eacc532fa193c735c92a383b7d66e6f8374ac193af7c64fc63` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS-UCS2-H.bcmap` | `ad2352f40870880fbf7f8ee5abadff743fbd025fbf9830b8ada472d1c5e4da0b` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS-UCS2-HW-H.bcmap` | `16e87edca954177c0881c874859d6783220925d821b5cdfb8755b61ebd93f9ce` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS-UCS2-HW-V.bcmap` | `1973457e2c0192819947e56068625b34fb9a72ecc8a476ce6d7eaae5f73e2e5c` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS-UCS2-V.bcmap` | `42a133d8e2ce9dd6d2288018e01592d2bf2435b326d39b94ea0b6e6a44ac33d3` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS-UTF16-H.bcmap` | `f6a89c5688978548c83fcee990e205bc63c74274d5c69b49032a3bd4c49a05ee` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS-UTF16-V.bcmap` | `c67126fc7c73850855186bb0d6482ac0a365057e0b58778c4ab9f234683fef53` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS-UTF32-H.bcmap` | `96195950ce0fe24443d8eb426fa6b88534ec421d7bef9046f0b2362809cfba73` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS-UTF32-V.bcmap` | `ed4dafda402bdd19c4d5d8bf2ab41473c0f86f384552b4c7b963d6627daedeb1` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS-UTF8-H.bcmap` | `798fb0bf06ab0788d1f6a91c2db7de581612eef03c628f10e8f7ecd8f70ab448` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS-UTF8-V.bcmap` | `1021611424f913b2df0bfdbe94bd327c04e224ec89d8e821c6501ea3d21f4265` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS2004-UTF16-H.bcmap` | `710a32d7cb43fd6bd9dbf30da5971f8c941590f74441e208d852c2be0e74cc97` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS2004-UTF16-V.bcmap` | `3b149aff5c5707b57fb3215d1775852c8b1f413ec0f679ea628f25cf87fe098d` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS2004-UTF32-H.bcmap` | `8d2658e18741af7937d586a57c89729a6fec0d86121197c1f8518aa58b29cdfb` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS2004-UTF32-V.bcmap` | `6dd475782f2897648a683c48b2fa015a15b8f06856760bddc8a17a63f418bacb` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS2004-UTF8-H.bcmap` | `691c614ce432b3e62486efb54e5c84c6da5afe9b51b21253bde4758feb484183` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJIS2004-UTF8-V.bcmap` | `40a8c7ea2d46711c5f78fc9a878a7db68b1543ba5cd60ecf14f519a2deb829b7` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJISPro-UCS2-HW-V.bcmap` | `6826f94d789d7bf1960668c1c5819c34c9585c1b23152fbc19ee81c7df08524b` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJISPro-UCS2-V.bcmap` | `493de9fd1a08f7946065d8ab58f0c3c9fe489f5a0f109f2d05a3169b4bd5789f` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJISPro-UTF8-V.bcmap` | `6181d382cf736c5e09492e8be9f26f31fa25b7462253f23ab16646af432cad81` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJISX0213-UTF32-H.bcmap` | `692044e1fb33445668632bc9fe7386805c624864be1ddeb29d65bb0c99fc630c` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJISX0213-UTF32-V.bcmap` | `dd54e16ca7bffb3a886242549b2bf7d78a277087f7c60d2636f118c21a5b0646` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJISX02132004-UTF32-H.bcmap` | `f80ea5a989be30ccda5a8804baef6d3b4b044d2b339bf8b31c671b2466171cf6` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniJISX02132004-UTF32-V.bcmap` | `94c22bd99e771c5fbe0dd8dc39850570d4db0075074aca13e272813edd7cc57f` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniKS-UCS2-H.bcmap` | `a1081396ab4adb6f4a5b6c15f896963c244c1c9bcb65ce5616d06096a1b9811c` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniKS-UCS2-V.bcmap` | `6cab547431958fbdc1d401d06ebd4dd61a73f5509a10f974df32bcbca11a2e43` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniKS-UTF16-H.bcmap` | `42d35b396286499dfae1737a07adb3a64500df37b426580bfb1d3ea872938519` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniKS-UTF16-V.bcmap` | `5bdb7390c80dcc136cb47d41dc7460082560969c17322ee739fe3020fb642410` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniKS-UTF32-H.bcmap` | `3a01ec51ed1b828101351e337ffb8250abe11880032e5210f881170fed2588de` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniKS-UTF32-V.bcmap` | `dfda895eceaed081af030dbbb962b49629eea817fc3c02bae15db93d0c68acd7` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniKS-UTF8-H.bcmap` | `3fac9c65145f72d7d42157a3b9c5ed6904632184e6a0888f2b828699afd2002f` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/UniKS-UTF8-V.bcmap` | `9ecc6cf30dd354b9778ddba163b6cc7302b087ce9f39d1ba73472d2b75ed13ca` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/V.bcmap` | `b9ad1c0c09ff14bca52f9a28a9767eb857ad0e8946e64ba14c7387a7eb69866a` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/cmaps/WP-Symbol.bcmap` | `543923bead225732aba30976690ee89095a19628277b5863efecc2c728d5d7bf` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/pdf.mjs` | `495588717f62303a839e91a5343deebf1b41f52e2f9f6361e73dee6ea6a4355e` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/pdf.worker.mjs` | `f2870db902eaff8397442c912b69459980ac91f6f4b5ed827167b12cf7057930` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/FoxitDingbats.pfb` | `845c752392b6c914fb989c75a08b7792b88f542d2499042ef2889f8c814a16ed` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/FoxitFixed.pfb` | `b6c8fe53f134b8b6d4578cd2d544df4cee9624c4efa8d51a560fb40ea296101b` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/FoxitFixedBold.pfb` | `f1b7159702973f54fc86254ea38bcf3712b2a736eb3a0995751e9f4bb45ad603` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/FoxitFixedBoldItalic.pfb` | `8a000945843bd31add06aee63bf9fd41b7578b4f3242a4b7cd46349ad9d24d4d` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/FoxitFixedItalic.pfb` | `5007faf8320fa1fcc08b8894b356ad976f60b992ba29ee5272578bbdebaf3876` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/FoxitSerif.pfb` | `4f57d2b9d884af8f907bf22df6019b52d86cbf6214fdbd02b1ae05472a543f35` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/FoxitSerifBold.pfb` | `0bdf4b04e964139818d51eda03d566ba999fc3ba2421b1c6c51f9dc969022e80` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/FoxitSerifBoldItalic.pfb` | `a406cac82583bf98175cb62c87ed5e95c45fbb34eece63a10b0a13e793cb2e10` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/FoxitSerifItalic.pfb` | `610ae0687198045c4db5d1a6650fd5e92536631706382eb8b72e38df578d0ae9` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/FoxitSymbol.pfb` | `47967d055530e7357088a08403115425643ec2cdfd6201ba8af0fbd7116c1539` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/LICENSE_FOXIT` | `b578cdd2345840ada550bd12519533812320d5f1d21cf4c1c7e1b1b0a31c98b7` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/LICENSE_LIBERATION` | `d2c4d5b3e115a519cb58eb691aa64538397e2611f9ebe801392cf9667997e7dc` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/LiberationSans-Bold.ttf` | `361c61b82d575c5c35fd9157fda8b0194bcfcd0d88ea8521a4fb5dd53d33dddc` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/LiberationSans-BoldItalic.ttf` | `a224075ac17495ad0a3af3bc0a419ac0704a8b3fd1095456201fb9b095fc281d` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/LiberationSans-Italic.ttf` | `832b4406dbef23628800d3aaad21048534ac84d7e3ad955be83b8172ed8ef512` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/standard_fonts/LiberationSans-Regular.ttf` | `f8ace1f892b2bd9dc1792ba7f097fa7588f84fed48321480e04de5390828221f` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/LICENSE_JBIG2` | `9e66b7f1b934a28b37f3bc4dac97915de1674271e79a0a88182a18ed9731b4d1` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/LICENSE_OPENJPEG` | `a6af136f3e15038a666b61f376612a07d9a4e48cb7c01adbf3e33b3f14ab49b6` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/LICENSE_PDFJS_JBIG2` | `aad3cce09842e00e9e11ad5e8fef8cc02fbc3a3768fe2f007443b9cee37aaee5` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/LICENSE_PDFJS_OPENJPEG` | `717fc62da03292dbb4dd0c8280bd4ce7bb8550dcf31d772bc93455fb50313425` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/LICENSE_PDFJS_QCMS` | `508a77d2e7b51d98adeed32648ad124b7b30241a8e70b2e72c99f92d8e5874d1` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/LICENSE_QCMS` | `36d847ae882f6574ebc72f56a4f354e4f104fde4a584373496482e97d52d31bc` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/jbig2.wasm` | `e6bee67724a7b5436fe8162638e3708cfc8d52b6342db69a49715e30ff27cfdc` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/jbig2_nowasm_fallback.js` | `04c795a6657a4553a64b781ea3e85256203d913c3b71b72b85fa3ce00622f458` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/openjpeg.wasm` | `004a0e62db930ba9ff2a22212f4554d0bb57a0635a8287caf70f98117cee14ba` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/openjpeg_nowasm_fallback.js` | `0f998419819da4491d8302222aa9e2ff2494685641aa2a6c21c3760c29f3e319` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/qcms_bg.wasm` | `663d86126d5f5fcb1c61490f94353e2a8375660b8c5498ab3ebab5a34b08800e` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/quickjs-eval.js` | `fe7930418e869791ce892567dbd0bc4698152b7e550b5cefa553992c56ddc325` |
| REQUIRED_RUNTIME | `core/documents/vendor/pdf/wasm/quickjs-eval.wasm` | `7bcacc9f22cacf7e9b23866d2a6d1639693d40c7f144e41b7c69ed37ba9cbe8f` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/LICENSE.md` | `b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/core/LICENSE` | `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/core/tesseract-core-lstm.wasm.js` | `6510efc4e8b45c5465df30679b9911ffe0071cd2ee982fa064e6f5136ef2de85` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js` | `a37ac78b707e8d5d3d2e532cc3c4e69b04d127ea44a608f1e7de17640402aa5c` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/core/tesseract-core-relaxedsimd.wasm.js` | `716be037611f21b568347421f582f1e1a6456b6d5c3a7c2406c8a2a6c0136427` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js` | `e48e2f02ddae3716c8dd24bf41cd290d4efa96892d689cdc4013c2545d63f469` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/core/tesseract-core-simd.wasm.js` | `da428fd7989ba749855ea16718a83b23e7ce04016fe31866ad2735813efc7133` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/core/tesseract-core.wasm.js` | `a824c1b99a19e122d87e4467fe16aabb56c495d6cc9a08bc58cb8a7342636b43` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/lang/eng-README.md` | `adcb325473fe124291951a0a3d29fcb54b341828881570e45c42dc2a3a61a45d` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/lang/eng.traineddata.gz` | `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/lang/fra-README.md` | `22298684801f0225788c1fa128cf90df49a383907ac71d5d2e3fe79601b1800a` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/lang/fra.traineddata.gz` | `d611139672b3752c7097e671e4a1d9209dfd37f2aeb081ef6487fba3351e9255` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/tesseract-core-lstm.wasm` | `66b17df6e20c5329a17ffa9c202a47eaa3e32500b253d4c7f38e7f2bc01457c3` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/tesseract-core-relaxedsimd-lstm.wasm` | `7985c92d4c64e7267d24cadffe1b2a1da6bf8aa55fdcaf953fe94fe122a24545` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/tesseract-core-relaxedsimd.wasm` | `45f8c9b516df326b6ae6b493ed3a6289df5cbd10490e7b6ff8bf5b12ea42d1da` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/tesseract-core-simd-lstm.wasm` | `34e8d50cac216427d86bf397d610fdd9f49492539bbcdfbfccc4eda20c810bea` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/tesseract-core-simd.wasm` | `7d237a13edfeb0fa2f104744fccde0a00e0c076c3e23b7a8fc7af75ec9af2c3e` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/tesseract-core.wasm` | `c7f5ace62ac0ad065e71e9c6725f1d7cdf82e7eda8fba532cbb9563964da7098` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/tesseract.esm.min.js` | `64871d76c75609fd5413b88a8171e2ef40deedd77d5875ba23df104b2d05eb29` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/worker.min.js` | `576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d` |
| REQUIRED_RUNTIME | `core/documents/vendor/tesseract/worker.min.js.LICENSE.txt` | `45f54171aeaa1d10c0c1a66f374b7bba1f02472b1487fbe892eec04f840002ac` |
| REQUIRED_DOC | `docs/ANTHROPIC-DEEP-CAPACITY-01.md` | `a6c063c7f49ce9fe2883b4cc1eb5811ddf38b8ddfe28342c6f430596e2319b9f` |
| REQUIRED_DOC | `docs/ATELIER-ARCHITECTE-DIALOG-CONTEXT-PROPAGATION-FIX-02H.md` | `0619433b6e72a3dfc44cddca8085ba237817624f25836d3511735e6cd618a0ca` |
| REQUIRED_DOC | `docs/ATELIER-ARCHITECTE-REAL-LATENCY-FIX-03A.md` | `9ef11059db23791d61c2f0911c9547f70e340f077df7611e9b4206b1f1b03cc2` |
| REQUIRED_DOC | `docs/ATELIER-BETA-STABILIZATION-04.md` | `3c24833296a85f546d2659e07c9d18016b82451f7424c74f60e20fe238147860` |
| REQUIRED_DOC | `docs/ATELIER-CANONICAL-QUANTITY-TO-ADN-FIX-02E.md` | `d6cfd6a164d4b3d4fc4770cb859a3f4f80056b3137b977bfe977580a8afa1ab5` |
| REQUIRED_DOC | `docs/ATELIER-CODEX-INDEPENDENT-RUNTIME-AUDIT.md` | `b562b3c0ded7849b3eaafb9cdd336959aa46b05d980add0d1d3f3d5c428f609c` |
| REQUIRED_DOC | `docs/ATELIER-CRITIC-PREDISPLAY-BUDGET-AUDIT-01.md` | `ed2a26d516d3409a4b3a5fd17ab7bcfa179847e646801b5f474a287356cd384b` |
| REQUIRED_DOC | `docs/ATELIER-DEEP-CRITICAL-PATH-ROLE-AUDIT-01.md` | `8436440361a0f880fbd16098a755e7d5776950ceaecfe4a640e5d08d2ef99212` |
| REQUIRED_DOC | `docs/ATELIER-DEEP-ECONOMICS-CHAIN-01.md` | `3b61dd8e5e030c234db2d635b54e72c951f916a9684f6532e573e260782fead5` |
| REQUIRED_DOC | `docs/ATELIER-DEEP-EFFICIENCY-ECONOMICS-01.md` | `ff57fc3985e5bd98979807d4abd362e18b5e4fec1cbe73788617ead018bfa3ad` |
| REQUIRED_DOC | `docs/ATELIER-DEEP-OUTPUT-MINIMIZATION-AUDIT-01.md` | `771725362b1eaf8b0576d289d28565ec621896dfa513f133d4e844c9c41621e0` |
| REQUIRED_DOC | `docs/ATELIER-DEEP-PROVIDER-THROUGHPUT-AUDIT-01.md` | `87f55eaf6858d7ecfd84939559f6352e84923d554b7408fcf77873e769494d23` |
| REQUIRED_DOC | `docs/ATELIER-DEEP-TURN-AMORTIZATION-01.md` | `af690a6a16634b32162d73b2946c7266ee8c5a3a39e44c196a20d7c66fd61b88` |
| REQUIRED_DOC | `docs/ATELIER-EARLY-CLARIFICATION-AUDIT-01.md` | `b29e2f9286e1c0b2b55bc9bb5e90bc6e7967cabe881e1cdf451e850d0ca6b5c2` |
| REQUIRED_DOC | `docs/ATELIER-FAST-DEEP-TRIGGER-CONFORMANCE-01.md` | `3db9a862bc0f00b4cf33a285e8c788c266a7482eaa4c657bbcaf894ce0cf6325` |
| REQUIRED_DOC | `docs/ATELIER-FAST-DEEP-TRIGGER-FIX-01.md` | `54e1be2cdf78e8510345bdeb8f3446305703a93a51aab775ff7fc8e2dcd4bd73` |
| REQUIRED_DOC | `docs/ATELIER-FAST-DEEP-TRIGGER-REAL-SMOKE-01.md` | `34a57a708add28dbda5ee28aef3b7c7822484a767fb60a0803cbb4d0fe64068c` |
| REQUIRED_DOC | `docs/ATELIER-FAST-NECESSARY-QUESTION-FIX-03B.md` | `b73c4dd55729a2ced93d100d4cbfec9b96cc73a3e37e070f9df3acb2d02a9e95` |
| REQUIRED_DOC | `docs/ATELIER-FINAL-HTML-CONSOLIDATION-01.md` | `d0ee18ef20804980157a6019ba680ca386e8f89fd03da4ef00620d4c0dba532d` |
| REQUIRED_DOC | `docs/ATELIER-INTERACTION-LATENCY-CONTRACT-01.md` | `56261a7f572388ac80050f9c26d08ee07ef71e39e1a07bb773ebe060da48eb87` |
| REQUIRED_DOC | `docs/ATELIER-INTERMEDIATE-DEEP-VALUE-01.md` | `db714aa5c81a762e543ce363bfb9427247fbbbc669c59e5040d597ae9036f1ed` |
| REQUIRED_DOC | `docs/ATELIER-LLM-ARCHITECTURE-SURGEON-01.md` | `98f8400e4f4b58442c39ca2aab8f65477e0864328834b916b7fe1374c1da7429` |
| REQUIRED_DOC | `docs/ATELIER-PRODUCT-SMOKE-02F-BIS.md` | `01bc26d09cf9e2b391e23481a41fb6662c0d795c7576d3a1501f9f35a6ff2332` |
| REQUIRED_DOC | `docs/ATELIER-PROMPT-PRODUCT-E2E-CONFORMANCE-02A.md` | `0fa7a06275f32abff5ae987094664b819e70c1ef31f4f9435167ecbdaf4407a9` |
| REQUIRED_DOC | `docs/ATELIER-PROVENANCE-SAFE-PROMPT-PROJECTION-FIX-02G.md` | `dabe7b5d34f87277d4b6b91bc2c1e65c6b33ff68c86722548c53a85e116f3365` |
| REQUIRED_DOC | `docs/ATELIER-QUANTITY-PROJECTION-FIX-02F.md` | `96f8676d529af9b40823ebc3e54e30203d5db300c247d88cc49c42c058a2aef9` |
| REQUIRED_DOC | `docs/ATELIER-QUANTITY-TRACE-ARBITER-TO-PROMPT-02D.md` | `6821d06169c2aeb8e332a93a61dbf2d790cc96a34771e9d1f04eaf606d0ee993` |
| REQUIRED_DOC | `docs/ATELIER-RAPIDE-CANONICAL-FAIL-CLOSED-FIX-02C.md` | `9d77daeaecb709042fca0978b6ecade90c28a154f320c067d233ceabcd78bfe7` |
| REQUIRED_DOC | `docs/ATELIER-REAL-PRODUCT-BETA-SMOKE-01.md` | `5b82baab3ead7a2f3fe86cf311e693583d6ad2b796878eb25b238d8be909f90a` |
| REQUIRED_DOC | `docs/ATELIER-RELEASE-GATE-01.md` | `57494ccb8d0db93960230d98354056e73ecb05f464dd676f5b1ab231fc1866ad` |
| REQUIRED_DOC | `docs/ATELIER-SINGLE-DELIVERED-PROMPT-GATE-FIX-02B.md` | `08d39199e14e6ca601caaa00ac54b38f2c14125760daa95c14cadbf8648467b5` |
| REQUIRED_DOC | `docs/ATELIER-VISUAL-MERGE-FINAL-01-REPORT.md` | `b3c1ef26b5bcab07b2a11fc144b59cf2066b098bdb32b10d7a0ffe648625b4fb` |
| REQUIRED_DOC | `docs/ATELIER-WORKER-DEPLOYMENT-ALIGNMENT-03D.md` | `c6f3d73dcb2940ff4c35e0b331951f1a1f6c229a3ea556be4d96521cc67e1d21` |
| REQUIRED_DOC | `docs/ATELIER-WORKER-RELEASE-ALIGNMENT-03D.json` | `a59aa390cd861cde8eac99baeeb70f63d3145557bc5e778a4393d9b045498040` |
| REQUIRED_DOC | `docs/ATELIER-WORKER-RELEASE-ALIGNMENT-03D.md` | `4f8fdadcb89144b1380afba015c8cb0c3a5cbe3f8faa00a2f112ffca335f3c71` |
| REQUIRED_DOC | `docs/BETA04-TEST-CLASSIFICATION.md` | `34782de7e2bbe7fe012c9822a6e99875fdef48e4dcf95bc9bf6a92c60ea825d8` |
| REQUIRED_DOC | `docs/CAPACITY-SLA-DEFINITION-01.md` | `7df757a294b95567cac340b3824d05aaf9ab8fea915fa7ed51917163b7e69fde` |
| REQUIRED_DOC | `docs/CRITIC-POSTPROVIDER-TYPEERROR-01.md` | `c9b6d591c920f748cf56f34b33652ff3cdc14054d73954460ea3864819f87f7f` |
| REQUIRED_DOC | `docs/DEEP-ANTHROPIC-ACCEPTANCE-01.md` | `4218e62ea2ca9ea92618f895635068b96729665c456e91782ff10596b76db051` |
| REQUIRED_DOC | `docs/DEEP-COUT-JETONS-01.md` | `5d298c68b4b7d5fe6adc285e828abd6c0a33a611c2407013835162009302e3a2` |
| REQUIRED_DOC | `docs/DEEP-HAIKU-FIT-01.md` | `ca9bca976b87042587e4cfe07c32d232e40f67a8cd5905e1f2c7295e86382b12` |
| REQUIRED_DOC | `docs/DEEP-INTERACTION-EARLY-STOP-01.md` | `c192e95e7aa1d6a974209a9a69f191626a944802323215e11a2a0da9212dad9f` |
| REQUIRED_DOC | `docs/DEEP-INTERACTION-LATENCY-01.md` | `92a5032cb5ccfec33214c7262e93844befc31ce1b9e0df646dc015de1e26ede3` |
| REQUIRED_DOC | `docs/DEEP-OUTPUT-MINIMALITY-01-AUDIT.md` | `7f941496d93073fa45ff386c3271a160918a38bc6476fd31cdf34f8e868960f8` |
| REQUIRED_DOC | `docs/DEEP-OUTPUT-MINIMALITY-01-EXPERIMENT-A.md` | `1f38623c261f4533805442ad6ab97b33f2c5c10c45cf39e5b5b2a000b7bb8274` |
| REQUIRED_DOC | `docs/DEEP-OUTPUT-ROBUSTNESS-01.md` | `61402e871f52f9e6663e26256d0132ca43126bb79b805cc4858ff9c14fe60f38` |
| REQUIRED_DOC | `docs/DEEP-PRODUCTION-BLOCKERS-01.md` | `62d88bc95a303d1e330f0911dd4d58540fc08af2f641be33f1fd19dee63511f2` |
| REQUIRED_DOC | `docs/DEEP-PROVIDER-ROUTING-FINAL-01.md` | `dea4886a323bf2d1006299639f21c31c1973cf47049774a697c4474d6a2226ec` |
| REQUIRED_DOC | `docs/DEEP-RESIDUAL-502-ATTRIBUTION-01.md` | `023aa9e037222aefa5dcd447d316fdf04d3ae04333a998502256340e82c90131` |
| REQUIRED_DOC | `docs/DEEP-RESIDUAL-502-ATTRIBUTION-02.md` | `b4ccc94959e0ec7f7dc0723e74cc53457f62f34d7c19d22b274d7833866c472c` |
| REQUIRED_DOC | `docs/DOCUMENT-RELIABILITY-20260923.md` | `188ed601e763011b4aa5f7f9e721b54f67abb5400e4c18d7af17d8e3afa0c6fc` |
| REQUIRED_DOC | `docs/FAST-CAPACITY-ADMISSION-01.md` | `27bb4a5f4c197828cdf65f60e0c9de2d775f637cb7eb691c52162cbe8c279d12` |
| REQUIRED_DOC | `docs/OBSERVABILITY-COMPLETENESS-01.md` | `ad03cc9f297ff04ea6326c1243ee85e884529a2c1fedc80b4711e5c2bbbe61bf` |
| REQUIRED_DOC | `docs/OPEN-DEBTS.md` | `cce92ba10b4bb7e8698fc8a6db8791f1af85c6466028baf6bd7f421c7c42a65d` |
| REQUIRED_DOC | `docs/OPRIE-ARBITER-MATERIAL-CONTEXT-DELIVERY-01.md` | `ac9bd6f73b7d18c1ea8e6760fdb11e42a37ebe7496cdb22d606f4b4972bcd960` |
| REQUIRED_DOC | `docs/OPRIE-CRITIC-B01B-FAILURE-CLASSIFICATION-01.md` | `019bee219d0e353b3918452c06189e3e4652cc4af62f741974d7e0443001cb12` |
| REQUIRED_DOC | `docs/OPRIE-CRITIC-MATERIAL-AWARENESS-01.md` | `f5857503ce556393a453e679c4cf902252d64518d6cf45d5444312954c35b566` |
| REQUIRED_DOC | `docs/OPRIE-CRITIC-MATERIAL-CONTEXT-DELIVERY-01.md` | `7ef49742295a936bbf95094f8cc38c051d2057b05d5b6b69d601e7c278112ae5` |
| REQUIRED_DOC | `docs/OPRIE-EXPECTED-DELIVERABLE-SEMANTICS-01.md` | `53b0bd2840cb9b68f3aa2641f312526986b93b6da5edeca35dceb5f0e9840035` |
| REQUIRED_DOC | `docs/OPRIE-INPUT-AVAILABILITY-FIELD-01.md` | `9588366616cd1e47d7878ebac01c08dafc9f81a55dd94b4c6630ba51a3b468e4` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-CONTENT-01.md` | `f054f6b5a0c39e92b00a1ef49ce701f7623ae1f6976760e8efa3f733e6382427` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-CONTENT-02.md` | `4a2cb1bfc2915099b982df7ab1fb35e2e05eaa0424b81813f963c80c67f405bf` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-CONTEXT-01.md` | `2ce2729e3e6ccae1aa4d740d2302afe19f07ba80336d108a406a41daa621ef76` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-CONTEXT-02.md` | `32570d057739a6042d9d367d721a20035b02621f72ae61e90f6b7e0280bbff3b` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-INTERPRETATION-01.md` | `e453ca80c15e984fbf549dc6b26c3313103bc4dc7b287be8ff5d07084552946b` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-PROVENANCE-01.md` | `291cdf010a20e1bdbc8788db7e49c71c41b3d437bd70fa165d62dd2fc3325ce1` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-PROVENANCE-02.md` | `57a928e2037c95c04038e51cc6691d55e99f2672ef8c918377f4a878cbcc2148` |
| REQUIRED_DOC | `docs/OPRIE-MATERIAL-PROVENANCE-CONFORMANCE-01.md` | `4ddff6fe8e24a8cd1eae2bfcc5798ac4b7d6fccd02542148602fb3291bae63f9` |
| REQUIRED_DOC | `docs/OPRIE-QUALITY-PARITY-01.md` | `d46a60a86d4883e935e575e0ec8e1ce9f177614942903ee64ec88560d6eb1a2b` |
| REQUIRED_DOC | `docs/OPRIE-REFERENCE-ORACLE-01.md` | `e09e87dd9092a3e98f59aa1773dc19ede0cda8fbf63fdd8be226c8d127a8814f` |
| REQUIRED_DOC | `docs/PERF-CAPACITY-DECISION-01.md` | `6a0e659414e4d3e28c320646b8a8f839a619f80455a037ba823bc8329eb7c553` |
| REQUIRED_DOC | `docs/PERF-NOMINAL-PROVIDER-01.md` | `2bd66e87aedf0b0e29fe095db6177a503bb29d5928d222befa87012378eea0fd` |
| REQUIRED_DOC | `docs/PERF-REAL-01-REPORT.md` | `4d3b16bf400738cffb21995deb9302788dc67dd8da25649cecc7592b345bd77e` |
| REQUIRED_BUILD | `package-lock.json` | `613abb35daf2e173f07413a7c1a1357f3ef0622fc31d9bf3380487e0a00d19b3` |
| REQUIRED_BUILD | `package.json` | `7330770eb5f978d6dde710e294bad18b79c7f065e951b2304667dada8e5ebe0f` |
| BUILD_TOOL | `tools/build-adn-browser-runtime.mjs` | `5b43a54d8c561dea23cdca4462af16c9ffd418487489c21d5b03cae97c1a2cf3` |
| BUILD_TOOL | `tools/build-document-assets.mjs` | `687907ba13e0ad41e9bbfe9878d8642ad4b33da653a24ad7739cf43925db02f9` |
| BUILD_TOOL | `tools/build-release-manifest.mjs` | `9d6892497ae98b886b261ef334f9603dc4ab86c4523cc5da5a915c4adfa518bb` |
| BUILD_TOOL | `tools/frozen-guard.mjs` | `fa1d9b3e323bf350157f623e49e4d91d40afabe12a0adf7415ac90343bfe038c` |
| REQUIRED_RUNTIME | `workers/groq/src/index.js` | `12427109e36adc6a81fc623368279aa22656c67b7d6042e80c0ffe3bca7ce211` |
| REQUIRED_RUNTIME | `workers/groq/wrangler.jsonc` | `a49272421d15e9348d5e389e37e36a493f40c6a65c13ec0bbd8e56ac964ebfb7` |
| REQUIRED_RUNTIME | `workers/shared/bounded-concurrency.js` | `033c06782be23a64103b193ce005dccc894d0a741f3687dcf7ee566b0a817973` |
| REQUIRED_RUNTIME | `workers/shared/core-first-plane.js` | `4a136472ed0b5b010d9391cd8f5814bf96e20bbfba0f093afea78d70b24dbaac` |
| REQUIRED_RUNTIME | `workers/shared/decision-core.js` | `89fd8d5a4315b92a82b483d6b4885962fe5600b8e47852fb4fe02b630019a48d` |
| REQUIRED_RUNTIME | `workers/shared/fast-interaction-endpoint.js` | `c6863967be2f9572405666ffceb1fe686dfbd3b4a414f2511b1f0f7f74a62282` |
| REQUIRED_RUNTIME | `workers/shared/fast-interactive-plane.js` | `9aa8b893e383b3275f39d36e8124dc5d16d9f8cfaaf61b629ac6447a99f7a215` |
| REQUIRED_RUNTIME | `workers/shared/operational-request-core.js` | `955290698df3397fe8b56aa50da90b7cabb6800a7a641a4c97fdd1e82a2615f7` |
| REQUIRED_RUNTIME | `workers/shared/operational-request-orchestrator.js` | `90b1012f03e946ebeb838ea3fc033b8467f1d8c21b384ed61bad8fedd1906a98` |
| REQUIRED_RUNTIME | `workers/shared/provider-ha.js` | `fd05e3400d32626fcfdd6041a38a35a623846e6563d93afeae1872940dce426f` |
| REQUIRED_RUNTIME | `workers/shared/provider-rate-control.js` | `38da9840452fa70e444108559d78b9423e733208cf05e0a23f350936e3a94abd` |
| REQUIRED_RUNTIME | `workers/shared/role-degradation.js` | `2259190f7f3a2b2f224605fc1b3ae8c4d6552f88e4cf4d56e34875b61a6a9ab7` |
| REQUIRED_RUNTIME | `workers/shared/solicitation-policy.js` | `ae77fa0612b3e7d5bda1cddc3e9cc838f2f0721860b2f14b4b0bfefb99a9f585` |
| REQUIRED_RUNTIME | `workers/workers-ai/src/index.js` | `a198c0f8e845122f42e57e1fae18ba21f50a4c822cfca45acea6ca8ee2167643` |
| REQUIRED_RUNTIME | `workers/workers-ai/wrangler.jsonc` | `2bb01da47bbb8d869da3ab0b31d2cd7d40ed98c9008fcced69c3e94072a3be6f` |

## Ce qui ne part pas en release

| Classe | Fichiers | Raison |
| --- | --- | --- |
| REQUIRED_TEST_ONLY | 220 | preuves ; ne sont pas servies |
| EVALUATION_ONLY | 378 | bancs et campagnes, dont le worker `…-local-only` |
| AUDIT_ONLY | 76 | relevés des lots passés |
| PROVENANCE | 2 | trace de la dérivation de l'artefact courant |

## Dépendances réseau

| Type | Nombre | Détail |
| --- | --- | --- |
| Ressource statique distante | 0 | aucune : images en `data:`, styles et scripts inclus |
| Fournisseur à l'exécution | 3 | les deux workers de décision, et l'API du fournisseur avec la clé de la personne |

## État des chaînes

*Observation reportée d'un lancement de tests : ces lignes ne sont pas recalculées
par ce script.*

| Chaîne | État |
| --- | --- |
| IA / orchestration | CLOSED |
| MODE | CLOSED |
| CLEAN | CLOSED |
| FORMAT-STRUCT-01 | CLOSED |
| EXEC-PHASE-INSTRUMENT-01 | CLOSED |
| FC01b FINAL | CLOSED |
| HTML-FINAL-01 / 01A | CLOSED |
| Tests au vert | 3715 |

## Dette encore ouverte

- **PERF-REAL-01** — la latence réelle d'un fournisseur réel n'est pas mesurée.

## Publication

| Champ | Valeur |
| --- | --- |
| LOCAL_ARTIFACT_READY | YES |
| RELEASE_READY | NO |
| PUSH_PERFORMED | NO |
| DEPLOY_PERFORMED | NO |

`RELEASE_READY` reste **NO** tant que `PERF-REAL-01` est ouverte : l'artefact est
complet et vérifié localement, mais rien ici ne dit ce qu'il coûte en temps réel
à quelqu'un qui l'utilise avec un vrai fournisseur.
