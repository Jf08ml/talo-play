import type { GameId } from "./games";

/**
 * Full instructions per game, shown in the lobby, the waiting room and from
 * "Reglas" in every room's header. The catalog's `howTo` stays as the short
 * three-step version for cards and previews. Pure data; `art` names an
 * illustration drawn by `components/GuideArt.tsx`.
 */

export type ArtId =
  | "parchis"
  | "backgammon"
  | "otelo"
  | "damas"
  | "ajedrez"
  | "truco"
  | "chinchon"
  | "domino"
  | "oca"
  | "cuatro"
  | "cajas"
  | "naval"
  | "codigo"
  | "onda"
  | "palabra"
  | "generala"
  | "lobo"
  | "sopa"
  | "deslizante"
  | "memotest"
  | "ludo";

export interface GuideSection {
  title: string;
  /** One paragraph per string. */
  text: string[];
  art?: ArtId;
}

export interface Guide {
  /** What you're trying to do, in one line. */
  goal: string;
  sections: GuideSection[];
  tips?: string[];
}

export const GUIDES: Record<GameId, Guide> = {
  rompecabezas: {
    goal: "Armar la foto lo antes posible: todos juntos, o en una carrera rojos contra azules.",
    sections: [
      { title: "Preparación", text: ["Quien crea la sala sube una foto y elige cuántas piezas. Los demás entran con el link y ven las piezas mezcladas sobre la mesa."] },
      {
        title: "Cómo se arma",
        text: [
          "Arrastrá una pieza con el dedo o el mouse. Cuando queda cerca de su lugar, encaja sola y ya no se mueve.",
          "Pellizcá o usá la rueda del mouse para hacer zoom, y arrastrá la mesa vacía para moverte.",
          "Una pieza que está moviendo otro jugador se ve marcada: no la podés agarrar hasta que la suelte.",
        ],
      },
      { title: "Competencia", text: ["En modo competencia cada equipo arma su propia copia. Gana el equipo que coloca su última pieza primero."] },
    ],
    tips: ["Empiecen por los bordes: son las piezas con un lado recto.", "Repártanse zonas de la foto para no pisarse."],
  },
  deslizante: {
    goal: "Ordenar la imagen moviendo las fichas por el hueco, antes que los demás.",
    sections: [
      {
        title: "Cómo se mueve",
        text: [
          "Falta una ficha: ese hueco es lo único que permite moverse. Tocá una ficha que esté en la misma fila o columna que el hueco y se desliza hacia él (si hay varias en el medio, se corren todas).",
          "En la compu también podés usar las flechas del teclado.",
        ],
        art: "deslizante",
      },
      { title: "La carrera", text: ["Todos arrancan con la misma mezcla después de la cuenta regresiva. Ves el avance de los demás en miniatura. Gana el primero que deja la imagen completa."] },
    ],
    tips: ["Resolvé primero la fila de arriba y la columna de la izquierda; después el tablero que queda es más chico.", "Los números en las fichas indican su orden: 1 va arriba a la izquierda."],
  },
  memotest: {
    goal: "Encontrar todos los pares de cartas iguales.",
    sections: [
      {
        title: "Tu turno",
        text: [
          "Tocá dos cartas para darlas vuelta. Si forman pareja, quedan boca arriba y son tuyas.",
          "Si no son pareja, quedan visibles un momento y se vuelven a tapar: ¡memorizá dónde estaban!",
        ],
        art: "memotest",
      },
      {
        title: "Modos",
        text: [
          "Por turnos: gana quien junta más pares. Según la sala, acertar te deja seguir jugando o pasa el turno igual, y puede haber tiempo por turno.",
          "Cooperativo: todos dan vuelta cartas a la vez sobre el mismo tablero. El objetivo es terminarlo en el menor tiempo.",
        ],
      },
      { title: "Pares de palabras", text: ["Con cartas de texto, las dos cartas de un par no son iguales sino que van juntas (por ejemplo, país y capital)."] },
    ],
  },
  tutti: {
    goal: "Completar cada categoría con una palabra que empiece con la letra de la ronda. Las respuestas únicas valen más.",
    sections: [
      {
        title: "La ronda",
        text: [
          "Sale una letra al azar. Escribí una palabra para cada categoría que empiece con esa letra (por ejemplo, con la M: país «México», color «Marrón»).",
          "Cuando completás todo tocá «¡Basta!»: la ronda se cierra para todos. Si la sala tiene tiempo, también se cierra al terminar el reloj.",
        ],
      },
      {
        title: "La revisión",
        text: [
          "Se muestran las respuestas de todos. Si una no vale (no existe, no empieza con la letra, no es de la categoría), tocala para votarla en contra.",
          "Una respuesta queda anulada si la rechaza más de la mitad de los demás.",
        ],
      },
      {
        title: "Puntos",
        text: ["20 puntos si sos el único con respuesta válida en esa categoría; 10 si tu palabra es única; 5 si alguien más puso la misma. Al final de todas las rondas gana el que más sumó."],
      },
    ],
    tips: ["No hace falta completar todo para tocar ¡Basta!: a veces conviene cortar rápido.", "Las tildes y mayúsculas no importan al comparar."],
  },
  dibujo: {
    goal: "Dibujar tu palabra para que la adivinen rápido, y adivinar los dibujos de los demás.",
    sections: [
      {
        title: "Si te toca dibujar",
        text: [
          "Elegí una de las palabras que te ofrece la app (tenés unos segundos). Solo vos la ves.",
          "Dibujala con el dedo o el mouse. Podés cambiar el color y el grosor, borrar o deshacer. No vale escribir letras.",
        ],
      },
      {
        title: "Si te toca adivinar",
        text: [
          "Escribí en el chat lo que creés que es. Si acertás, la app te avisa a vos y los demás solo ven que adivinaste (no la palabra).",
          "Si estás a una letra de distancia te dice «¡Casi!».",
        ],
      },
      { title: "Puntos", text: ["Cuanto antes adivines, más sumás. El que dibuja suma por cada uno que adivina. Al final gana el que más puntos tiene."] },
    ],
  },
  codigo: {
    goal: "Que tu equipo encuentre todas sus palabras antes que el rival, sin tocar la bomba.",
    sections: [
      {
        title: "Equipos y jefes",
        text: [
          "Hay dos equipos, rojo y azul. Cada equipo elige un jefe de espías: es el único que ve el mapa secreto con el color de cada palabra.",
          "En el tablero hay 25 palabras: 9 del equipo que empieza, 8 del otro, 7 neutrales y 1 bomba.",
        ],
        art: "codigo",
      },
      {
        title: "El turno",
        text: [
          "El jefe da una pista: UNA palabra y un número (por ejemplo «Fruta 2»), que relacione esa cantidad de palabras de su equipo.",
          "Su equipo toca palabras de a una. Si es propia, siguen (hasta el número + 1). Si es neutral o del rival, termina el turno. Pueden cortar cuando quieran.",
        ],
      },
      { title: "Cómo termina", text: ["Gana el equipo que destapa todas sus palabras (aunque la última la destape el rival). Quien toca la bomba pierde en el acto."] },
    ],
    tips: ["Una pista que une 3 palabras es genial, pero arriesgada: fijate que no se parezca a la bomba."],
  },
  cuatro: {
    goal: "Alinear cuatro fichas de tu color antes que el rival.",
    sections: [
      {
        title: "Cómo se juega",
        text: [
          "Por turnos, tocá una columna: tu ficha cae hasta la posición más baja libre.",
          "Gana quien junta cuatro seguidas en horizontal, vertical o diagonal. Si se llena el tablero sin línea, es empate.",
        ],
        art: "cuatro",
      },
    ],
    tips: ["Las columnas del centro sirven para más líneas: arrancá por ahí.", "Mirá dónde puede ganar el rival en su próximo turno y tapalo."],
  },
  palabra: {
    goal: "Adivinar la palabra secreta de cinco letras en seis intentos o menos, antes que los demás.",
    sections: [
      {
        title: "Los colores",
        text: [
          "Escribí cualquier palabra de cinco letras y mandala. Cada letra se pinta:",
          "Verde: la letra está en la palabra y en ese lugar. Amarillo: está, pero en otro lugar. Gris: no está.",
        ],
        art: "palabra",
      },
      { title: "La carrera", text: ["Todos tienen la misma palabra. Ves los colores de los demás (no sus letras). Gana el primero que la adivina."] },
    ],
    tips: ["Arrancá con palabras de muchas vocales distintas, como «AUREO» o «OSCAR»."],
  },
  trivia: {
    goal: "Contestar bien y rápido para sumar más puntos que los demás.",
    sections: [
      { title: "Cada pregunta", text: ["Sale una pregunta con cuatro opciones para todos a la vez. Tocá una antes de que se termine el tiempo: no se puede cambiar."] },
      { title: "Puntos", text: ["Acertar da entre 500 y 1000 puntos: más cuanto más rápido contestás. Errar o no contestar da 0. Cuando contestan todos, se revela la respuesta."] },
    ],
  },
  impostor: {
    goal: "Si sos del grupo: descubrir al impostor. Si sos el impostor: que no te descubran (o adivinar la palabra).",
    sections: [
      {
        title: "Las cartas",
        text: [
          "Cada uno mira su carta a escondidas. Todos tienen la misma palabra secreta, menos uno: el impostor, que no la sabe (según la sala, ve la categoría).",
        ],
      },
      {
        title: "Las pistas",
        text: [
          "Por turnos, cada uno dice una pista sobre la palabra: que demuestre que la sabés, pero sin regalársela al impostor.",
          "El impostor tiene que inventar una pista creíble escuchando a los demás. Según la sala, las pistas se escriben en la app o se dicen en voz alta.",
        ],
      },
      {
        title: "La votación",
        text: [
          "Todos votan quién creen que es el impostor. Si hay empate o eligen mal, gana el impostor.",
          "Si lo descubren, tiene una última chance: si adivina la palabra, gana igual. Grupo: +1 cada uno. Impostor: +2.",
        ],
      },
    ],
  },
  naval: {
    goal: "Hundir los cinco barcos del rival antes de que hunda los tuyos.",
    sections: [
      {
        title: "Preparación",
        text: ["Ubicá tus barcos en tu mapa de 10 × 10: tocá un barco, después la casilla, y giralo si querés. No se pueden superponer. También podés mezclarlos al azar. Cuando estés, tocá «Listo»."],
      },
      {
        title: "La batalla",
        text: [
          "Por turnos, tocá una casilla del mapa rival para disparar. Agua: pasa el turno. Tocado: le diste a un barco y tirás de nuevo. Hundido: completaste todas sus casillas.",
        ],
        art: "naval",
      },
    ],
    tips: ["Cuando tocás un barco, probá las casillas de al lado para seguirlo."],
  },
  probable: {
    goal: "Votar con la mayoría y ver a quién le cuelga cada título.",
    sections: [
      { title: "Cada ronda", text: ["Sale una frase: «¿Quién es más probable que…?». Cada uno vota en secreto a alguien de la sala (vale votarse)."] },
      { title: "La revelación", text: ["Cuando votan todos se ve quién se llevó más votos. Si votaste a ese (o a uno de los empatados), sumás un punto. El más votado se lleva el título."] },
    ],
  },
  conoces: {
    goal: "Adivinar lo que contestan los demás sobre sí mismos (y que te adivinen a vos).",
    sections: [
      { title: "El turno", text: ["A uno le toca una pregunta sobre sí mismo y elige su respuesta en secreto. Al mismo tiempo, los demás eligen lo que creen que contestó."] },
      { title: "Puntos", text: ["Cada acierto suma un punto para quien adivinó y otro para el protagonista. Al final se ve quién conoce mejor a quién."] },
    ],
  },
  generala: {
    goal: "Sumar más puntos que los demás llenando tu planilla con las mejores jugadas.",
    sections: [
      {
        title: "Tu turno",
        text: [
          "Tirás los cinco dados hasta tres veces. Entre tiro y tiro, tocá los dados que querés guardar; el resto se vuelve a tirar.",
          "Al final anotá el resultado en un casillero libre de tu planilla. Si no te sirve ninguno, tachá uno (vale 0).",
        ],
      },
      {
        title: "Los casilleros",
        text: [
          "Del 1 al 6: la suma de los dados de ese número. Escalera (1-2-3-4-5, 2-3-4-5-6 o 3-4-5-6-1): 20, o 25 si sale servida (en el primer tiro). Full (tres iguales y dos iguales): 30, servido 35. Póker (cuatro iguales): 40, servido 45. Generala (cinco iguales): 50.",
          "Generala servida gana la partida en el acto. Doble generala vale 100, pero solo si ya anotaste la generala.",
        ],
        art: "generala",
      },
    ],
    tips: ["Tachá la generala doble o el 1 cuando no tengas nada: son los que menos perdés."],
  },
  emojis: {
    goal: "Adivinar qué película, serie, dicho o lugar esconden los emojis, más rápido que los demás.",
    sections: [
      {
        title: "Cómo se juega",
        text: [
          "Aparecen unos emojis y la categoría. Escribí lo que creés que es: podés probar todas las veces que quieras, y la app te avisa si estás cerca.",
          "A la mitad del tiempo aparece una pista con la primera letra de cada palabra.",
        ],
      },
      { title: "Puntos", text: ["Acertar da entre 500 y 1000 puntos según lo rápido que fuiste. Las tildes, mayúsculas y artículos no importan."] },
    ],
  },
  verdades: {
    goal: "Descubrir las mentiras de los demás y engañarlos con la tuya.",
    sections: [
      { title: "Escribir", text: ["Escribí tres frases sobre vos: dos verdaderas y una inventada, y marcá cuál es la mentira. Que la mentira sea creíble y las verdades, sorprendentes."] },
      { title: "Votar", text: ["Por turnos se muestran las tres frases de cada uno y los demás votan cuál es la mentira. Si acertás, sumás 1. Por cada uno que se la cree, el autor suma 1."] },
    ],
  },
  damas: {
    goal: "Dejar al rival sin fichas o sin jugadas.",
    sections: [
      {
        title: "Mover",
        text: [
          "Las fichas avanzan en diagonal, de a una casilla, siempre hacia adelante. Juegan solo en las casillas oscuras. Empiezan las blancas.",
        ],
      },
      {
        title: "Comer",
        text: [
          "Se come saltando por encima de una ficha rival que está pegada en diagonal, si la casilla de atrás está libre. Se puede comer hacia adelante o hacia atrás.",
          "Comer es obligatorio. Si después de comer la misma ficha puede seguir comiendo, sigue en el mismo turno.",
        ],
        art: "damas",
      },
      { title: "Dama", text: ["La ficha que termina su jugada en la última fila se corona dama: se mueve y come en diagonal a cualquier distancia, en las cuatro direcciones."] },
    ],
  },
  cajas: {
    goal: "Cerrar más cuadrados que los demás.",
    sections: [
      {
        title: "Cómo se juega",
        text: [
          "Por turnos, tocá el espacio entre dos puntos vecinos para trazar una línea.",
          "Si tu línea cierra el cuarto lado de un cuadrado, ese cuadrado es tuyo y volvés a jugar.",
        ],
        art: "cajas",
      },
      { title: "Final", text: ["Cuando no quedan líneas, gana quien tiene más cuadrados."] },
    ],
    tips: ["Evitá trazar el tercer lado de un cuadrado: le regalás el cuarto al siguiente."],
  },
  reto: {
    goal: "Animarse a todo: contestar con la verdad o cumplir el reto.",
    sections: [
      { title: "Cada turno", text: ["Al que le toca elige verdad o reto. Aparece una pregunta para contestar con la verdad, o un desafío para cumplir ahí mismo (o por videollamada)."] },
      { title: "El juicio", text: ["Los demás votan si cumplió: suma un punto. Si se rajó, queda anotado como «gallina». No hay final: jueguen hasta que quieran."] },
    ],
  },
  mimica: {
    goal: "Que tu equipo adivine la mayor cantidad de palabras con tu actuación.",
    sections: [
      { title: "Equipos", text: ["Se arman dos equipos en la sala. Se juega en persona: todos con el celular, pero en cada turno solo actúa uno."] },
      {
        title: "Actuar",
        text: [
          "Al que le toca actuar toca «Empezar» y ve la palabra. La representa con gestos, sin hablar, sin hacer sonidos ni señalar cosas.",
          "Su equipo grita lo que cree que es. Si aciertan, tocá «¡Adivinaron!» y sale otra palabra. Si es muy difícil, pasala. El equipo rival también ve la palabra y controla.",
        ],
      },
      { title: "Puntos", text: ["Cada palabra adivinada suma 1. Después de los turnos elegidos, gana el equipo con más puntos."] },
    ],
  },
  ahorcado: {
    goal: "Adivinar la palabra antes de completar el ahorcado.",
    sections: [
      { title: "La palabra", text: ["En cada ronda, a uno le toca elegir la palabra secreta (o pedir que la elija la app)."] },
      {
        title: "Adivinar",
        text: [
          "Los demás, por turnos, proponen una letra o arriesgan la palabra completa. Cada letra que está se descubre en todos sus lugares y suma 1 punto.",
          "Cada letra que no está (o palabra errada) dibuja una parte del ahorcado. Con seis errores, gana el que eligió la palabra (+3). Quien la completa suma 3.",
        ],
      },
    ],
  },
  sopa: {
    goal: "Encontrar más palabras escondidas que los demás.",
    sections: [
      {
        title: "Marcar una palabra",
        text: ["Las palabras están en línea recta: horizontal, vertical o diagonal (en los niveles difíciles, también al revés). Tocá la primera letra y después la última."],
        art: "sopa",
      },
      { title: "Puntos", text: ["Cada palabra es de quien la marca primero. Cuando se encuentran todas, gana quien tiene más."] },
    ],
  },
  carreras: {
    goal: "Completar las vueltas antes que los demás pilotos.",
    sections: [
      {
        title: "La pantalla y los volantes",
        text: [
          "Abrí la sala en una compu conectada a la tele o al proyector: ahí se ve la pista desde arriba.",
          "Cada piloto entra desde su teléfono con el código y elige un auto: el teléfono es su volante.",
        ],
      },
      {
        title: "Manejar",
        text: [
          "El auto acelera solo. Doblá con los botones de izquierda y derecha, o activá «inclinar» y girá el teléfono como un volante. El botón de freno frena y da marcha atrás.",
          "Las flechas de la pista te impulsan y las rampas te hacen volar. Chocar contra las paredes o los demás te frena.",
        ],
      },
    ],
    tips: ["Frená un poco antes de las curvas cerradas: salís más rápido."],
  },
  carreras3d: {
    goal: "Completar las vueltas antes que los demás pilotos.",
    sections: [
      {
        title: "Dónde se ve",
        text: [
          "Pantalla grande: la carrera se ve en una tele o proyector, dividida en una vista por piloto, y los teléfonos son los volantes.",
          "Cada uno en su teléfono: cada piloto ve la carrera en 3D en su propio teléfono (conviene ponerlo horizontal). Sirve a distancia.",
        ],
      },
      {
        title: "Manejar",
        text: [
          "El auto acelera solo. Doblá con los botones o inclinando el teléfono; el freno frena y da marcha atrás.",
          "Podés cambiar la cámara: detrás del auto o desde la cabina. Las flechas del piso te impulsan y las rampas te hacen volar.",
        ],
      },
    ],
    tips: ["Si el juego va lento, bajá la calidad gráfica desde el botón de la pantalla."],
  },
  arena: {
    goal: "Que tu equipo sea el último en pie en cada ronda, hasta ganar las rondas pedidas.",
    sections: [
      {
        title: "Armas",
        text: [
          "Arrancás con una daga. Por la arena hay espadas, hachas, mazas, lanzas, arcos y escudos: acercate y agarralos. Cada arma tiene su alcance y velocidad.",
          "Si la sala tiene pociones, las del piso te curan.",
        ],
      },
      {
        title: "Pelear",
        text: [
          "Atacá en el momento justo y volvé a atacar durante el golpe para encadenar un combo. Bloqueá de frente para frenar golpes (no los de atrás) y esquivá para escapar.",
          "Correr, bloquear y esquivar gastan aguante: si se vacía, quedás expuesto.",
        ],
      },
      {
        title: "Controles",
        text: [
          "Celular: joystick a la izquierda para moverte, arrastrá la pantalla para mirar, y botones para atacar, bloquear, esquivar, saltar y agarrar.",
          "Compu: hacé clic en la arena. WASD para moverte, mouse para mirar, Shift para correr, clic para atacar, clic derecho o F para bloquear, Q para esquivar, espacio para saltar, E para agarrar y V para cambiar la cámara.",
        ],
      },
    ],
  },
  yonunca: {
    goal: "Contar lo que hiciste (sin que nadie te vea votar) y descubrir lo de los demás.",
    sections: [
      { title: "Cada frase", text: ["Aparece «Yo nunca nunca…». Cada uno toca «Yo sí» (lo hice) o «Yo no» en su celular. Nadie ve tu respuesta hasta que contestan todos."] },
      { title: "La revelación", text: ["Se muestra quién lo hizo. Cada «yo sí» suma al ranking final de quién vivió más."] },
    ],
  },
  onda: {
    goal: "Que el grupo ubique la aguja lo más cerca posible del objetivo secreto.",
    sections: [
      {
        title: "La pista",
        text: [
          "A uno le toca ver en secreto dónde está el objetivo en una escala entre dos extremos (por ejemplo «Frío ↔ Caliente»).",
          "Da una pista: una palabra, una cosa o un personaje que, para él, esté justo en ese punto.",
        ],
        art: "onda",
      },
      { title: "Adivinar", text: ["Los demás mueven la aguja del dial y confirman. Cuanto más cerca del objetivo, más puntos (4, 3 o 2). El que dio la pista suma el promedio del grupo."] },
    ],
  },
  telefono: {
    goal: "Reírse viendo cómo se deforma cada frase al pasar de mano en mano.",
    sections: [
      {
        title: "Las cadenas",
        text: [
          "Primero todos escriben una frase divertida a la vez.",
          "Después cada frase pasa al siguiente, que la dibuja. Ese dibujo pasa a otro, que describe con palabras lo que ve. Y así, alternando, hasta dar la vuelta.",
        ],
      },
      { title: "El álbum", text: ["Al final miran juntos cada cadena paso a paso: cómo empezó y cómo terminó. No hay puntos: gana la risa."] },
    ],
    tips: ["Si se acaba el tiempo, se manda lo que tenías hecho: no dejes el dibujo en blanco."],
  },
  ludo: {
    goal: "Llevar tus cuatro fichas desde tu casa hasta la meta, antes que los demás.",
    sections: [
      {
        title: "El tablero",
        text: [
          "Cada color tiene su casa en una esquina, su casilla de salida (pintada de su color) y su pasillo final hacia el centro. Las fichas dan la vuelta al tablero en el sentido de las agujas del reloj y después entran por su pasillo.",
          "Las casillas con círculo son seguros: ahí no se come.",
        ],
        art: "parchis",
      },
      {
        title: "Tu turno (Parchís)",
        text: [
          "Tirás el dado y movés una ficha esa cantidad. Con un 5 sacás una ficha de casa (si podés, es obligatorio). Con un 6 volvés a tirar; si ya no tenés fichas en casa, el 6 cuenta 7. Tres 6 seguidos: la última ficha que moviste vuelve a casa.",
          "Dos fichas de tu color en la misma casilla forman una barrera: nadie puede pasar, ni siquiera vos. Con un 6 estás obligado a abrirla.",
        ],
      },
      {
        title: "Comer y llegar",
        text: [
          "Si caés en la casilla de una ficha rival que está sola y no es un seguro, te la comés: vuelve a su casa y vos contás 20 con la ficha que quieras.",
          "Para entrar a la meta necesitás el número justo. Cada ficha que llega te da 10 casillas de premio para otra ficha.",
        ],
      },
      {
        title: "Ludo clásico",
        text: ["Si la sala es de Ludo clásico: se sale con un 6, las estrellas son los seguros, no hay barreras y comer o llegar a la meta te da otra tirada."],
        art: "ludo",
      },
    ],
    tips: ["Una barrera justo delante de la salida de un rival lo deja trabado.", "Antes de mover, fijate qué fichas rivales tenés a menos de 6 casillas detrás."],
  },
  lobo: {
    goal: "Pueblo: eliminar a todos los lobos. Lobos: quedar en igual número que el resto.",
    sections: [
      {
        title: "Los roles",
        text: ["Cada uno recibe un rol secreto en su celular. Nadie más lo ve."],
        art: "lobo",
      },
      {
        title: "La noche",
        text: [
          "Todos tocan a alguien en secreto, así nadie se delata: los lobos eligen a su víctima, la vidente descubre el rol de alguien y el médico protege a uno (no al mismo dos noches seguidas). Los aldeanos eligen a cualquiera: no pasa nada.",
        ],
      },
      {
        title: "El día",
        text: [
          "Se anuncia quién murió (o que el médico lo salvó). Hablen, acusen, defiéndanse… y voten a quién eliminar. Con empate no se elimina a nadie.",
          "Los eliminados ya no votan, pero ven todos los roles: ¡sin spoilear!",
        ],
      },
    ],
    tips: ["Si sos la vidente, cuidado con revelar lo que sabés demasiado pronto: los lobos te van a buscar."],
  },
  ajedrez: {
    goal: "Dar jaque mate: atacar al rey rival sin que tenga escapatoria.",
    sections: [
      {
        title: "Cómo se mueve cada pieza",
        text: [
          "Rey: una casilla en cualquier dirección. Dama: cualquier distancia en línea recta o diagonal. Torre: cualquier distancia en línea recta. Alfil: cualquier distancia en diagonal. Caballo: en «L» (dos y una), y puede saltar piezas. Peón: avanza uno (dos en su primera jugada) y come en diagonal hacia adelante.",
        ],
        art: "ajedrez",
      },
      {
        title: "Jugadas especiales",
        text: [
          "Enroque: el rey se mueve dos casillas hacia una torre y la torre salta a su lado, si ninguno se movió antes y el rey no pasa por casillas atacadas.",
          "Captura al paso y coronación: un peón que llega al final se convierte en la pieza que elijas (normalmente dama).",
        ],
      },
      {
        title: "Final",
        text: ["Jaque mate gana. Si el que mueve no tiene jugadas y no está en jaque, es tablas (ahogado); también por material insuficiente, 50 jugadas sin capturas ni movimientos de peón, o si se acuerdan tablas."],
      },
    ],
    tips: ["En la app, tocá una pieza para ver sus casillas posibles: no te deja hacer jugadas ilegales."],
  },
  chinchon: {
    goal: "No pasarte del límite de puntos: el último que queda adentro gana.",
    sections: [
      {
        title: "Tu turno",
        text: ["Tenés 7 cartas. Agarrá una del mazo o la de arriba del pozo, y después tirá una al pozo (no la misma que levantaste del pozo)."],
      },
      {
        title: "Ligar",
        text: [
          "Juntá piernas (3 o 4 cartas del mismo número) y escaleras (3 o más seguidas del mismo palo). Los comodines reemplazan cualquier carta.",
        ],
        art: "chinchon",
      },
      {
        title: "Cortar",
        text: [
          "Podés cortar cuando tenés todo ligado salvo, como mucho, una carta de 5 o menos. Las cartas sueltas de cada uno suman puntos (sus números). Cortar con todo ligado resta 10.",
          "Un chinchón (siete cartas seguidas del mismo palo, sin comodines) gana la partida en el acto. Quien pasa el límite queda afuera.",
        ],
      },
    ],
  },
  truco: {
    goal: "Llegar primero a los porotos pedidos (15 o 30), ganando manos, envidos y trucos.",
    sections: [
      {
        title: "Las cartas",
        text: ["Cada uno recibe tres cartas. En cada baza todos tiran una carta y gana la más alta según el orden del truco (abajo). Gana la mano quien gana dos de las tres bazas; si empatan una baza (parda), la define la siguiente."],
        art: "truco",
      },
      {
        title: "El envido",
        text: [
          "Solo en la primera baza, antes de tirar tu carta, podés cantar envido, real envido o falta envido. Se compara el envido de cada uno:",
          "Con dos cartas del mismo palo: 20 + la suma de las dos (las figuras 10, 11 y 12 valen 0). Si no, vale la carta más alta. La app lo calcula por vos.",
        ],
      },
      {
        title: "El truco",
        text: [
          "En cualquier momento de tu turno podés cantar truco (la mano vale 2). El rival contesta quiero, no quiero (y vos sumás 1) o sube a retruco (3); y después vale cuatro (4).",
          "Si no te conviene seguir, podés irte al mazo: el rival gana lo que valía la mano.",
        ],
      },
    ],
    tips: ["El 1 de espada y el 1 de basto son las cartas más fuertes: si los tenés, cantá truco con confianza."],
  },
  fuego: {
    goal: "Llegar primero a las bajas pedidas (o tener más cuando se acaba el tiempo).",
    sections: [
      {
        title: "Armas y escudo",
        text: [
          "Arrancás con fusil, pistola y granadas. Por el mapa hay escopeta, francotirador y lanzacohetes; llevás dos armas a la vez (agarrar una cambia la que tenés en la mano).",
          "El escudo absorbe los primeros daños y se recarga solo si dejan de pegarte. La vida, en cambio, solo vuelve con botiquines.",
        ],
      },
      {
        title: "Controles",
        text: [
          "Compu: hacé clic en el juego. WASD para moverte, mouse para mirar, clic para disparar, clic derecho para apuntar, R recarga, Q / 1 / 2 o la rueda cambian de arma, G tira una granada, F o V golpea, E agarra, espacio salta y Tab muestra el puntaje.",
          "Celular: joystick para moverte, arrastrá para mirar, botón de disparo (si lo arrastrás, también mirás), y botones para apuntar, saltar, recargar y granadas. El francotirador apunta mientras mantenés y dispara al soltar.",
        ],
      },
    ],
    tips: ["Si te quedás sin escudo, cubrite unos segundos antes de volver a pelear."],
  },
  otelo: {
    goal: "Terminar con más fichas de tu color en el tablero.",
    sections: [
      {
        title: "Jugar una ficha",
        text: [
          "En tu turno ponés una ficha que encierre, en línea recta o diagonal, una o más fichas rivales entre la nueva y otra tuya. Todas las encerradas se dan vuelta y pasan a ser tuyas.",
          "Solo podés jugar donde encerrás al menos una: la app te marca esas casillas.",
        ],
        art: "otelo",
      },
      { title: "Final", text: ["Si no tenés jugada, pasás. Cuando ninguno puede jugar (o se llena el tablero), gana quien tiene más fichas."] },
    ],
    tips: ["Las esquinas nunca se pueden dar vuelta: son las casillas más valiosas.", "Evitá jugar en las casillas pegadas a una esquina vacía: le abrís la esquina al rival."],
  },
  backgammon: {
    goal: "Llevar tus 15 fichas a tu casa y sacarlas del tablero antes que el rival.",
    sections: [
      {
        title: "Hacia dónde se mueve",
        text: [
          "Cada uno mueve en sentido contrario. Vos movés de los puntos altos (24) a los bajos (1): tu casa son los puntos 1 a 6, abajo a la derecha. El tablero siempre se ve desde tu lado.",
        ],
        art: "backgammon",
      },
      {
        title: "Tu turno",
        text: [
          "Tirás dos dados y movés una ficha por cada dado (puede ser la misma dos veces). Los dobles valen cuatro movimientos.",
          "No podés caer en un punto con dos o más fichas rivales. Tenés que usar todos los dados que puedas; si solo podés usar uno, tiene que ser el mayor.",
          "En la app: tocá una ficha (se marcan en celeste las que se pueden mover) y después el punto verde a donde va. Podés deshacer antes de tocar «Listo».",
        ],
      },
      {
        title: "Comer y la barra",
        text: [
          "Si caés en un punto con una sola ficha rival, la comés: va a la barra del medio. Quien tiene fichas en la barra tiene que hacerlas entrar por la casa del rival antes de mover cualquier otra.",
        ],
      },
      {
        title: "Sacar fichas y ganar",
        text: [
          "Cuando tus 15 fichas están en tu casa, empezás a sacarlas con el número exacto del punto (o con uno más alto si no hay fichas más atrás).",
          "Ganar vale 1 punto; 2 (gammon) si el rival no sacó ninguna; 3 (backgammon) si además le queda alguna en la barra o en tu casa.",
        ],
      },
      {
        title: "El cubo de doblaje",
        text: ["Antes de tirar, podés ofrecer doblar lo que vale la partida. El rival acepta (y el cubo pasa a ser suyo: solo él puede volver a doblar) o se rinde y pierde lo que valía hasta ahí."],
      },
    ],
    tips: ["Dos fichas juntas en un punto lo bloquean: armá varios puntos seguidos para encerrar al rival."],
  },
  oca: {
    goal: "Llegar primero al jardín de la Oca, la casilla 63.",
    sections: [
      { title: "Tu turno", text: ["Tirá los dados y tu ficha avanza sola. Si caés en una casilla especial, pasa lo que dice."] },
      {
        title: "Las casillas",
        text: [
          "🪿 Oca: «de oca a oca y tiro porque me toca»: saltás a la próxima oca y volvés a tirar.",
          "🌉 Puentes (6 y 12) y 🎲 dados (26 y 53): vas al otro y volvés a tirar.",
          "🏨 Posada (19): perdés un turno. ⛓️ Cárcel (52): perdés dos. 🕳️ Pozo (31): quedás ahí hasta que caiga otro y te rescate.",
          "🌀 Laberinto (42): volvés a la 30. 💀 Calavera (58): volvés al principio.",
        ],
        art: "oca",
      },
      { title: "Llegar", text: ["Para entrar al jardín (63) hace falta el número justo: lo que sobra, retrocede. Con dos dados, si en tu primera tirada sacás 6 y 3 vas directo a la 26, y con 4 y 5, a la 53."] },
    ],
  },
  domino: {
    goal: "Quedarte sin fichas antes que los demás y sumar los puntos que les quedan.",
    sections: [
      {
        title: "Las fichas",
        text: ["Cada ficha tiene dos números del 0 al 6. Cada uno recibe 7. Empieza quien tiene el doble más alto (en la primera mano, el doble seis); después, quien ganó la mano anterior."],
      },
      {
        title: "Tu turno",
        text: [
          "Poné una ficha que tenga el mismo número que una de las dos puntas de la mesa. Si entra en las dos puntas, la app te pregunta en cuál.",
          "Si no tenés ficha que entre: de a 2 o 3 robás del pozo hasta que te salga una; si el pozo está vacío (o juegan de a 4), pasás.",
        ],
        art: "domino",
      },
      {
        title: "Fin de la mano",
        text: [
          "Gana la mano quien se queda sin fichas («dominó») y suma los puntos de las fichas que les quedan a los rivales.",
          "Si nadie puede jugar, la mesa se tranca: gana quien tiene menos puntos en la mano. De a 4 se juega en parejas: los que se sientan enfrente suman juntos.",
        ],
      },
    ],
    tips: ["Sacate de encima primero las fichas con números altos: si se tranca, pesan menos.", "Fijate qué números va pasando el rival: no los tiene."],
  },
};
