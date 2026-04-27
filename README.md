<h1>Batalha Naval — Jogo em JavaScript</h1>

<p>Projeto simples de <strong>Batalha Naval</strong> implementado em HTML, CSS e JavaScript. O jogo oferece modos contra a máquina (PvE) com uma IA baseada em estratégias <em>hunt/target</em> e modo local 1 vs 1 (PvP) em um mesmo dispositivo.</p>

<img width="1691" height="862" alt="image" src="https://github.com/user-attachments/assets/3702d5d5-321b-466a-a4ef-c9a72f4c3696" />

<section>
	<h2>Recursos</h2>
	<ul>
		<li>Posicionamento manual ou aleatório de navios.</li>
		<li>Modo PvE com IA em níveis de dificuldade configuráveis.</li>
		<li>Modo PvP local com overlay para troca de jogador.</li>
		<li>Regra: ao acertar um navio, o jogador continua jogando até errar.</li>
		<li>Feedback visual (acertos, erros, afundados) e log de batalha.</li>
	</ul>
</section>

<section>
	<h2>VERCEL</h2>
	<p>O jogo está disponível na Vercel para teste, você pode acessar pelo link: <a href="https://batalha-naval-game-three.vercel.app/" target="_blank" rel="noopener noreferrer">Jogo</a></p>
</section>

<section>
	<h2>Como executar</h2>
	<p>Abra uma sessão HTTP local na pasta do projeto e acesse no navegador. Um exemplo usando Python:</p>
	<pre><code>python3 -m http.server 8000
# então abra http://localhost:8000</code></pre>
</section>

<section>
	<h2>Controles</h2>
	<ul>
		<li>Clique nas células para posicionar ou atacar.</li>
		<li>Durante o posicionamento, pressione <code>R</code> para rotacionar o navio selecionado.</li>
		<li>Use os botões na interface para limpar, posicionamento aleatório e confirmar quando estiver pronto.</li>
	</ul>
</section>

<section>
	<h2>Regras do jogo</h2>
	<ul>
		<li>Cada jogador possui um conjunto de navios com tamanhos pré-definidos.</li>
		<li>Ao atacar, se o jogador acertar uma célula com parte de um navio, ele tem direito a jogar novamente; somente ao errar o turno passa ao adversário.</li>
		<li>O objetivo é afundar todos os navios do oponente.</li>
	</ul>
</section>

<section>
	<h2>Estrutura do projeto</h2>
	<ul>
		<li><code>index.html</code> — interface do jogo.</li>
		<li><code>styles/style.css</code> — folhas de estilo e tema visual.</li>
		<li><code>scripts/game.js</code> — lógica principal do jogo (posicionamento, ataques, IA, fluxo de tela).</li>
	</ul>
</section>

<section>
	<h2>Contribuições</h2>
	<p>Pull requests são bem-vindos. Para alterações de comportamento do jogo, prefira mudanças pequenas e testáveis. Se for adicionar uma feature grande, abra uma issue primeiro para discutir o design.</p>
</section>

<section>
	<h2>Licença</h2>
	<p>Distribuído sem licença explícita. Atribua uma licença no repositório se desejar torná-lo público.</p>
</section>

