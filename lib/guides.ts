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
  | "triqui"
  | "ladrillazo"
  | "puentes"
  | "tronco"
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
          "Arrastra una pieza con el dedo o el mouse. Cuando queda cerca de su lugar, encaja sola y ya no se mueve.",
          "Pellizca o usa la rueda del mouse para hacer zoom, y arrastra la mesa vacía para moverte.",
          "Una pieza que está moviendo otro jugador se ve marcada: no la puedes agarrar hasta que la suelte.",
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
          "Falta una ficha: ese hueco es lo único que permite moverse. Toca una ficha que esté en la misma fila o columna que el hueco y se desliza hacia él (si hay varias en el medio, se corren todas).",
          "En la computadora también puedes usar las flechas del teclado.",
        ],
        art: "deslizante",
      },
      { title: "La carrera", text: ["Todos arrancan con la misma mezcla después de la cuenta regresiva. Ves el avance de los demás en miniatura. Gana el primero que deja la imagen completa."] },
    ],
    tips: ["Resuelve primero la fila de arriba y la columna de la izquierda; después el tablero que queda es más chico.", "Los números en las fichas indican su orden: 1 va arriba a la izquierda."],
  },
  puentes: {
    goal: "Cruzar todos los puentes del mapa sin pasar dos veces por el mismo, o darse cuenta de que no se puede.",
    sections: [
      {
        title: "Cómo se juega",
        text: [
          "Toca una isla para pararte ahí y empezar. Después toca los puentes que salen de donde estás: tu talo los cruza y quedan marcados. Los que puedes cruzar ahora brillan.",
          "Cada puente se cruza una sola vez. Si te quedas en una isla sin puentes libres, te trabaste: deshaz los últimos pasos o empieza de nuevo desde otra isla.",
        ],
        art: "puentes",
      },
      {
        title: "Nunca el mismo mapa",
        text: ["Cada mapa se inventa en el momento a partir de un número al azar, así que no hay soluciones para aprenderse: lo que sirve es entender el truco."],
      },
      {
        title: "El truco",
        text: [
          "Cuenta cuántos puentes tiene cada isla. Si todas tienen una cantidad par, puedes empezar en cualquiera y vas a terminar donde empezaste. Si exactamente dos tienen una cantidad impar, tienes que salir de una de esas dos y vas a terminar en la otra.",
          "Si hay más de dos islas con una cantidad impar de puentes, no existe ningún recorrido: es imposible.",
        ],
      },
      {
        title: "Las trampas",
        text: [
          "A medida que subes de nivel aparecen: puentes de una mano (solo se cruzan hacia donde marca la flecha), puentes dobles (con un número: hay que cruzarlos dos veces), una isla de salida o de llegada obligatoria (las banderas) y mapas sin solución.",
          "Cuando puede tocarte un mapa sin solución aparece el botón «No se puede». Si tenías razón, ganas; si sí se podía, pierdes ese mapa (o esa ronda).",
        ],
      },
      {
        title: "Solo",
        text: [
          "«Niveles sin fin»: cada nivel es un poco más grande que el anterior. Ganas hasta tres estrellas según cuántas veces deshiciste o empezaste de nuevo.",
          "«Reto del día»: el mismo mapa para todo el mundo, con un solo intento. Los más rápidos quedan en el ranking del día.",
        ],
      },
      {
        title: "Carrera con amigos o en línea",
        text: [
          "Todos reciben el mismo mapa a la vez, cada uno en su pantalla. Ves cuántos puentes cruzó cada uno, pero no cuáles. El primero que lo resuelve suma 3 puntos, el segundo 2 y el resto que llega, 1. Cuando alguien termina, los demás tienen 40 segundos.",
          "Entre ronda y ronda se muestra una forma de resolverlo (o por qué no se podía).",
        ],
      },
    ],
    tips: [
      "Antes de tocar nada, cuenta los puentes de cada isla: te dice dónde empezar y si es posible.",
      "Deja para el final los puentes que te encierran: si cruzas el único camino de vuelta a una zona demasiado pronto, no puedes volver.",
    ],
  },
  minigolf: {
    goal: "Meter la pelota en el hoyo con la menor cantidad de golpes, hoyo por hoyo, en todo el recorrido.",
    sections: [
      {
        title: "Cómo se tira",
        text: [
          "Apoya el dedo (o el mouse) en cualquier parte de la cancha y arrastra hacia atrás, como si estiraras una gomera: la pelota sale para el lado contrario. Cuanto más arrastras, más fuerte le pegas; los puntos te muestran para dónde va y qué tan fuerte.",
          "Suelta para pegarle. Si te arrepientes, vuelve el dedo cerca de donde empezaste y suelta: no cuenta.",
          "La pelota rebota en las paredes y en los bordes blancos. Si llega al hoyo muy rápido, pega en el borde y sigue de largo: hay que llegar con la fuerza justa.",
        ],
      },
      {
        title: "La cancha",
        text: [
          "Pendientes: las flechas marcan para dónde cae la pelota.",
          "Arena: frena mucho.",
          "Agua: te cuesta un golpe extra y la pelota vuelve a donde le pegaste.",
          "Molinos: giran sin parar; pasa cuando dejan el hueco.",
          "Bumpers: los talos rosas te devuelven la pelota con más fuerza.",
        ],
      },
      {
        title: "Los golpes",
        text: [
          "Cada hoyo tiene un par: los golpes que debería llevarte. Menos es un birdie (uno menos) o un águila (dos menos); más es un bogey. En un golpe, ¡hoyo en uno!",
          "Como máximo son 8 golpes por hoyo: si no entra antes, anotas 8 y pasas al siguiente.",
        ],
      },
      {
        title: "Solo",
        text: [
          "«Recorrido de 9 hoyos»: eliges la dificultad y cada recorrido se inventa en el momento. Se guarda tu mejor resultado contra el par.",
          "«Hoyos del día»: los mismos 3 hoyos para todo el mundo, con un solo intento. Los de menos golpes quedan en el ranking del día.",
        ],
      },
      {
        title: "Con amigos o en línea",
        text: [
          "Todos juegan el mismo hoyo a la vez, cada uno en su pantalla, y ven las pelotas de los demás. Cuando todos terminan (o se acaba el tiempo) pasan juntos al siguiente; el que no llegó anota sus golpes más 2.",
          "Gana el que suma menos golpes en todo el recorrido. Se pueden sumar bots, cada uno con su puntería.",
        ],
      },
    ],
    tips: [
      "En los tiros largos, apunta a dejarla cerca del hoyo antes que a meterla: un tiro fácil después vale más que un rebote loco.",
      "Usa las paredes: un tiro en diagonal que rebota puede doblar una curva en un solo golpe.",
    ],
  },
  memotest: {
    goal: "Encontrar todos los pares de cartas iguales.",
    sections: [
      {
        title: "Tu turno",
        text: [
          "Toca dos cartas para darlas vuelta. Si forman pareja, quedan boca arriba y son tuyas.",
          "Si no son pareja, quedan visibles un momento y se vuelven a tapar: ¡memoriza dónde estaban!",
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
          "Sale una letra al azar. Escribe una palabra para cada categoría que empiece con esa letra (por ejemplo, con la M: país «México», color «Marrón»).",
          "Cuando completas todo toca «¡Basta!»: la ronda se cierra para todos. Si la sala tiene tiempo, también se cierra al terminar el reloj.",
        ],
      },
      {
        title: "La revisión",
        text: [
          "Se muestran las respuestas de todos. Si una no vale (no existe, no empieza con la letra, no es de la categoría), tócala para votarla en contra.",
          "Una respuesta queda anulada si la rechaza más de la mitad de los demás.",
        ],
      },
      {
        title: "Puntos",
        text: ["20 puntos si eres el único con respuesta válida en esa categoría; 10 si tu palabra es única; 5 si alguien más puso la misma. Al final de todas las rondas gana el que más sumó."],
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
          "Elige una de las palabras que te ofrece la app (tienes unos segundos). Solo tú la ves.",
          "Dibújala con el dedo o el mouse. Puedes cambiar el color y el grosor, borrar o deshacer. No vale escribir letras.",
        ],
      },
      {
        title: "Si te toca adivinar",
        text: [
          "Escribe en el chat lo que crees que es. Si aciertas, la app te avisa a ti y los demás solo ven que adivinaste (no la palabra).",
          "Si estás a una letra de distancia te dice «¡Casi!».",
        ],
      },
      { title: "Puntos", text: ["Cuanto antes adivines, más sumas. El que dibuja suma por cada uno que adivina. Al final gana el que más puntos tiene."] },
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
    tips: ["Una pista que une 3 palabras es genial, pero arriesgada: fíjate que no se parezca a la bomba."],
  },
  cuatro: {
    goal: "Alinear cuatro fichas de tu color antes que el rival.",
    sections: [
      {
        title: "Cómo se juega",
        text: [
          "Por turnos, toca una columna: tu ficha cae hasta la posición más baja libre.",
          "Gana quien junta cuatro seguidas en horizontal, vertical o diagonal. Si se llena el tablero sin línea, es empate.",
        ],
        art: "cuatro",
      },
      {
        title: "En línea",
        text: ["¿No tienes con quién jugar? Elige «En línea» y te emparejamos al momento con alguien que también quiere jugar. Los colores se sortean y en cada revancha empieza el otro."],
      },
    ],
    tips: ["Las columnas del centro sirven para más líneas: empieza por ahí.", "Mira dónde puede ganar el rival en su próximo turno y tápalo."],
  },
  palabra: {
    goal: "Adivinar la palabra secreta de cinco letras en seis intentos o menos, antes que los demás.",
    sections: [
      {
        title: "Los colores",
        text: [
          "Escribe cualquier palabra de cinco letras y mandala. Cada letra se pinta:",
          "Verde: la letra está en la palabra y en ese lugar. Amarillo: está, pero en otro lugar. Gris: no está.",
        ],
        art: "palabra",
      },
      { title: "La carrera", text: ["Todos tienen la misma palabra. Ves los colores de los demás (no sus letras). Gana el primero que la adivina."] },
    ],
    tips: ["Empieza con palabras de muchas vocales distintas, como «AUREO» o «OSCAR»."],
  },
  trivia: {
    goal: "Contestar bien y rápido para sumar más puntos que los demás.",
    sections: [
      { title: "Cada pregunta", text: ["Sale una pregunta con cuatro opciones para todos a la vez. Toca una antes de que se termine el tiempo: no se puede cambiar."] },
      { title: "Puntos", text: ["Acertar da entre 500 y 1000 puntos: más cuanto más rápido contestas. Errar o no contestar da 0. Cuando contestan todos, se revela la respuesta."] },
    ],
  },
  impostor: {
    goal: "Si eres del grupo: descubrir al impostor. Si eres el impostor: que no te descubran (o adivinar la palabra).",
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
          "Por turnos, cada uno dice una pista sobre la palabra: que demuestre que la sabes, pero sin regalársela al impostor.",
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
        text: ["Ubica tus barcos en tu mapa de 10 × 10: toca un barco, después la casilla, y gíralo si quieres. No se pueden superponer. También puedes mezclarlos al azar. Cuando estés, toca «Listo»."],
      },
      {
        title: "La batalla",
        text: [
          "Por turnos, toca una casilla del mapa rival para disparar. Agua: pasa el turno. Tocado: le diste a un barco y tiras de nuevo. Hundido: completaste todas sus casillas.",
        ],
        art: "naval",
      },
      {
        title: "En línea",
        text: ["¿No tienes con quién jugar? Elige «En línea» y te emparejamos al momento con alguien que también quiere jugar. Quién dispara primero se sortea y en cada revancha empieza el otro."],
      },
    ],
    tips: ["Cuando tocas un barco, prueba las casillas de al lado para seguirlo."],
  },
  probable: {
    goal: "Votar con la mayoría y ver a quién le cuelga cada título.",
    sections: [
      { title: "Cada ronda", text: ["Sale una frase: «¿Quién es más probable que…?». Cada uno vota en secreto a alguien de la sala (vale votarse)."] },
      { title: "La revelación", text: ["Cuando votan todos se ve quién se llevó más votos. Si votaste a ese (o a uno de los empatados), sumas un punto. El más votado se lleva el título."] },
    ],
  },
  conoces: {
    goal: "Adivinar lo que contestan los demás sobre sí mismos (y que te adivinen a ti).",
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
          "Tiras los cinco dados hasta tres veces. Entre tiro y tiro, toca los dados que quieres guardar; el resto se vuelve a tirar.",
          "Al final anota el resultado en un casillero libre de tu planilla. Si no te sirve ninguno, tacha uno (vale 0).",
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
    tips: ["Tacha la generala doble o el 1 cuando no tengas nada: son los que menos pierdes."],
  },
  emojis: {
    goal: "Adivinar qué película, serie, dicho o lugar esconden los emojis, más rápido que los demás.",
    sections: [
      {
        title: "Cómo se juega",
        text: [
          "Aparecen unos emojis y la categoría. Escribe lo que crees que es: puedes probar todas las veces que quieras, y la app te avisa si estás cerca.",
          "A la mitad del tiempo aparece una pista con la primera letra de cada palabra.",
        ],
      },
      { title: "Puntos", text: ["Acertar da entre 500 y 1000 puntos según lo rápido que fuiste. Las tildes, mayúsculas y artículos no importan."] },
    ],
  },
  verdades: {
    goal: "Descubrir las mentiras de los demás y engañarlos con la tuya.",
    sections: [
      { title: "Escribir", text: ["Escribe tres frases sobre ti: dos verdaderas y una inventada, y marca cuál es la mentira. Que la mentira sea creíble y las verdades, sorprendentes."] },
      { title: "Votar", text: ["Por turnos se muestran las tres frases de cada uno y los demás votan cuál es la mentira. Si aciertas, sumas 1. Por cada uno que se la cree, el autor suma 1."] },
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
      {
        title: "En línea",
        text: ["¿No tienes con quién jugar? Elige «En línea» y te emparejamos al momento con alguien que también quiere jugar. Los colores se sortean y en cada revancha se cambian."],
      },
    ],
  },
  cajas: {
    goal: "Cerrar más cuadrados que los demás.",
    sections: [
      {
        title: "Cómo se juega",
        text: [
          "Por turnos, toca el espacio entre dos puntos vecinos para trazar una línea.",
          "Si tu línea cierra el cuarto lado de un cuadrado, ese cuadrado es tuyo y vuelves a jugar.",
        ],
        art: "cajas",
      },
      { title: "Final", text: ["Cuando no quedan líneas, gana quien tiene más cuadrados."] },
    ],
    tips: ["Evita trazar el tercer lado de un cuadrado: le regalas el cuarto al siguiente."],
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
          "Su equipo grita lo que cree que es. Si aciertan, toca «¡Adivinaron!» y sale otra palabra. Si es muy difícil, pásala. El equipo rival también ve la palabra y controla.",
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
        text: ["Las palabras están en línea recta: horizontal, vertical o diagonal (en los niveles difíciles, también al revés). Toca la primera letra y después la última."],
        art: "sopa",
      },
      { title: "Puntos", text: ["Cada palabra es de quien la marca primero. Cuando se encuentran todas, gana quien tiene más."] },
    ],
  },
  vibora: {
    goal: "Ser la víbora más larga del mapa.",
    sections: [
      {
        title: "En línea o con amigos",
        text: [
          "«Jugar en línea» te mete en un mapa abierto con gente de todos lados. No hay tiempo: entras y sales cuando quieras, y el ranking de arriba muestra quién es más grande ahora. Los más grandes del día quedan en «Récords de hoy».",
          "«Solo con amigos» arma una sala privada: eliges la duración y si quieres bots que completen el mapa. Cuando se acaba el tiempo, gana la víbora más larga.",
        ],
      },
      {
        title: "Moverse",
        text: [
          "Tu víbora avanza sola. En el teléfono, apoya el dedo en cualquier parte y arrástralo hacia donde quieres ir; en la computadora, apunta con el mouse (o usa las flechas).",
          "Mantén el botón del rayo, el click o la barra espaciadora para acelerar. Acelerar gasta puntos: úsalo para escapar o para cerrarle el paso a alguien.",
        ],
      },
      { title: "Crecer", text: ["Cada bolita que comes te da puntos y te alarga. Las más grandes y brillantes valen más."] },
      {
        title: "Cortar colas",
        text: [
          "Si tu cabeza choca el cuerpo de otra víbora, se lo cortas justo ahí: ella se queda con la parte de adelante y tú te comes los puntos de lo que cortaste.",
          "La cabeza y el cuello no se pueden cortar, y una víbora recién cortada o recién aparecida tiene unos segundos de protección (se ve titilando).",
          "A ti también te pueden cortar: cuanto más larga es tu cola, más fácil es que alguien se la cruce.",
        ],
      },
      {
        title: "Perder (en línea)",
        text: [
          "En línea la cabeza y el cuello son duros: si tu cabeza choca contra la cabeza o el cuello de otra víbora, pierdes (si chocan de frente, pierde la más chica). Tocar el borde del mapa también te elimina.",
          "Cuando una víbora pierde, su cuerpo queda en el piso como restos brillantes que cualquiera puede comer. Al cortar una cola en línea, te comes la mitad al instante y la otra mitad cae como restos: ¡apúrate antes de que te los roben!",
          "Después de perder ves hasta dónde llegaste y puedes volver a empezar al toque.",
        ],
      },
      {
        title: "Con amigos",
        text: ["En la sala con amigos nadie pierde: el borde quema y te saca puntos mientras lo tocas, y al cortar te comes toda la cola. Cuando se acaba el tiempo, gana la más larga."],
      },
    ],
    tips: [
      "Cortar cerca de la cabeza se lleva casi toda la víbora.",
      "En línea, una víbora grande puede cruzarte su cabeza por delante: ¡no le pegues de frente!",
      "Si tu víbora es muy larga, enróscala para proteger la cola.",
      "Acelera para cruzarte justo delante de otra víbora y cortarla antes de que se escape.",
    ],
  },
  tronco: {
    goal: "Ser el último talo que queda parado en la ronda.",
    sections: [
      {
        title: "La ronda",
        text: [
          "Todos están parados en ronda y en el medio gira un tronco que barre a cada uno. Tu talo es el de la etiqueta amarilla, y la cámara siempre está detrás tuyo.",
          "Arranca uno de la ronda: el tronco descansa a sus pies y lo patea para el lado que quiera. Todos ven para dónde sale y arranca a girar un momento después.",
          "Abajo de todo hay una barra: el tronco aparece del lado del que viene y se acerca a tu círculo. Cuando entra en la parte amarilla se ilumina «Saltar»; cuando entra en la verde (más cerca) se iluminan los dos. El círculo que tienes en el piso se pinta igual.",
        ],
        art: "tronco",
      },
      {
        title: "Saltar o patear",
        text: [
          "«Saltar» (o espacio / flecha arriba): el tronco pasa por abajo tuyo y sigue para el mismo lado, hacia el siguiente. Hay que saltar un poquito antes de que llegue; mientras estás en el aire no puedes hacer otra cosa, pero apenas tocas el piso ya puedes de nuevo.",
          "«Patear» (o K / flecha abajo): si lo pateas cuando se pone verde, el tronco cambia de sentido y vuelve hacia el que te lo mandó. Si lo pateas muy temprano, pateas el aire y pierdes un instante.",
          "Si el tronco te toca con los pies en el piso, te tumba y quedas afuera. Sigues mirando hasta que termine.",
          "Si te tumba, te dice por qué: si llegaste tarde, si saltaste demasiado temprano (ya estabas bajando) o si pateaste antes de que se pusiera verde.",
        ],
      },
      {
        title: "Cada vez más difícil",
        text: [
          "El tronco acelera con el tiempo, y solo cambia de sentido cuando alguien lo patea.",
          "Ojo con saltar si tu vecino puede patearlo: te lo devuelve enseguida y tienes que estar listo para saltar otra vez.",
        ],
      },
      {
        title: "Para jugar",
        text: [
          "¿Primera vez? En el lobby está «Practicar»: un minuto con el tronco lento que te enseña a saltar y a patear sin quedar afuera.",
          "Con una tele: en «Amigos» elige «En una pantalla grande» y crea la sala desde la computadora conectada a la tele o al proyector. La ronda se ve ahí, con un anillo bajo cada talo que se pone amarillo (salta) o verde (patea), y los celulares son el control: dos botones grandes que vibran cuando el tronco llega. Para arrancar, el que patea elige hacia quién lo manda.",
          "«Contra bots»: tú y la computadora, al toque. «En línea»: rondas una atrás de la otra con gente de todos lados (y bots si hay poca). «Amigos»: una sala con link, y bots si quieren completar la ronda.",
        ],
      },
    ],
    tips: [
      "Patear es arriesgado pero le complica la vida al otro: se lo mandas rápido y quizás no lo espera.",
      "Si el que está al lado tuyo acaba de saltar, patéaselo de vuelta: con el tronco rápido le va a costar saltar de nuevo a tiempo.",
      "Si empiezas tú, mándalo para el lado del que esté más distraído.",
    ],
  },
  empujones: {
    goal: "Tirar a los demás al agua y ser el último talo que queda arriba de la isla.",
    sections: [
      {
        title: "La pantalla y los celulares",
        text: [
          "La isla se ve en una pantalla grande: una computadora conectada a la tele o al proyector. El que crea la sala lo hace desde esa computadora, y ahí se abre la isla con el código.",
          "Cada uno entra desde su celular con el código o el link: el celular es el control. Tu talo es el de tu color, con tu nombre arriba.",
          "Mientras esperan, ya pueden caminar y empujarse para probar: el que se cae vuelve enseguida.",
        ],
      },
      {
        title: "Los controles",
        text: [
          "A la izquierda: apoya el dedo en cualquier lado y muévelo para caminar. Arriba en el celular es arriba en la pantalla.",
          "«Empujar»: tu talo sale disparado para donde estás apuntando. Si choca a alguien, lo manda lejos y lo deja mareado un momento. Después hay que esperar un poquito para volver a usarlo (el botón se va llenando).",
          "«Aguantar» (mantenlo apretado): tu talo se planta y pesa mucho más, así que cuesta moverlo. Mientras aguantas caminas lento y no puedes empujar, y la barra se gasta: cuando se vacía, sueltas.",
          "En la computadora: WASD o las flechas para caminar, espacio para empujar y Shift para aguantar.",
        ],
      },
      {
        title: "Las rondas",
        text: [
          "Si el centro de tu talo sale de la isla, te caes al agua y quedas afuera hasta la próxima ronda.",
          "Al rato de empezar, la isla se empieza a achicar; si la ronda dura mucho, se termina hundiendo. Gana la ronda el último que queda arriba (si se caen todos juntos, no la gana nadie).",
          "Gana la partida el primero en ganar las rondas pedidas (2, 3 o 5). Los bots completan la isla si son pocos, hasta 8 en total.",
        ],
      },
    ],
    tips: [
      "No empujes desde el costado: ponte entre el otro y el centro de la isla, así el empujón lo manda derecho al agua.",
      "Si alguien viene embistiendo, aprieta «Aguantar» justo antes del choque: rebota él.",
      "Cerca del borde no te quedes quieto: un empujón y estás afuera. Vuelve al medio.",
      "Un empujón que no le pega a nadie te puede tirar solo al agua: apunta bien cerca del borde.",
    ],
  },
  golpe: {
    goal: "Poner a salvo más diamantes que los demás: robarlos del museo sin que te atrapen y llevarlos hasta una salida antes de que se acabe el tiempo.",
    sections: [
      {
        title: "El museo",
        text: [
          "Cada partida es un museo distinto, armado con salas y puertas. Cada ladrón arranca en una salida, en las esquinas: son las zonas a rayas que dicen «SALIDA».",
          "En las salas hay diamantes celestes (valen 1). En la bóveda, la sala del medio con alfombra, están los rosas (valen 3), pero es la más vigilada. Cuando alguien agarra uno, al rato aparece otro en la misma sala.",
          "Arriba a la izquierda tienes el mapa: ahí ves las salidas, la bóveda y dónde estás.",
        ],
      },
      {
        title: "La seguridad",
        text: [
          "Guardias: hacen siempre la misma ronda y en cada esquina se frenan a mirar. Lo que alumbra su linterna (la luz amarilla) lo ven. Si te ven, se llena una barra sobre tu cabeza: sal de la luz antes de que se complete. Si te chocas con un guardia, te atrapa al toque, aunque no te esté mirando.",
          "Cámaras: están en las esquinas y van girando de un lado a otro. Su luz es roja y tardan un poco más que un guardia en darse cuenta.",
          "Láseres: cruzan algunas puertas y se prenden y apagan solos. Antes de prenderse titilan. Si tocas uno prendido, te atrapa en el acto.",
          "Ni las paredes ni las puertas dejan ver a través: escóndete detrás de una pared y espera a que pase la luz.",
        ],
      },
      {
        title: "La mochila y la salida",
        text: [
          "Lo que agarras va a la mochila (entran 10). Cuanto más cargas, más lento caminas.",
          "Los diamantes recién cuentan cuando entras con ellos a una salida: ahí se vacía la mochila y quedan a salvo. Lo que todavía tengas en la mochila cuando se termina el tiempo no cuenta.",
          "Si te atrapan, te esposan unos segundos y se te cae la mitad de la mochila al piso (cualquiera la puede levantar). Después vuelves a tu salida y por un momento nadie te ve.",
        ],
      },
      {
        title: "Robar",
        text: [
          "Pégate a un rival que tenga diamantes en la mochila y toca «Robar» (espacio o E en la computadora): le sacas hasta 2. Después tienes que esperar unos segundos para volver a robar, y al que robaste no se le puede robar de nuevo enseguida.",
          "Lo que ya está a salvo en la salida no se puede robar.",
        ],
      },
      {
        title: "Equipos",
        text: [
          "En «Rojo contra azul», cada equipo usa sus dos salidas (las de su color) y suma todo lo que ponen a salvo sus ladrones. Entre compañeros no se roba.",
          "Los equipos se eligen en la sala de espera. Al empezar, el que no eligió va al equipo más chico, y los bots emparejan.",
        ],
      },
      {
        title: "Los controles",
        text: [
          "En el celular: apoya el dedo en cualquier lado y muévelo para caminar, como un joystick. El botón «Robar» se prende cuando tienes a alguien a tiro.",
          "En la computadora: WASD o las flechas para caminar, espacio o E para robar.",
        ],
      },
    ],
    tips: [
      "Antes de entrar a una sala, mira desde la puerta para qué lado va el guardia: entra cuando te da la espalda.",
      "No vayas a la salida con un diamante solo: junta unos cuantos, pero no tantos que te pongan lento justo cuando hay que escapar.",
      "Si alguien vuelve cargado hacia su salida, espéralo en el camino y róbale.",
      "En el último minuto vuelve a la salida: lo que quede en la mochila se pierde.",
    ],
  },
  gravedad: {
    goal: "Llegar a la bandera de cada nivel: caminando, saltando y, sobre todo, cambiando la gravedad para caminar por el techo y las paredes.",
    sections: [
      {
        title: "Moverte",
        text: [
          "Caminas a la izquierda y a la derecha y saltas, como en cualquier juego de plataformas. «Izquierda» y «derecha» siempre son como las ves en la pantalla.",
          "Celular: las flechas grandes abajo a la izquierda para caminar y «Saltar» abajo a la derecha. Computadora: ← → (o A D) para caminar y Espacio (o W, ↑) para saltar.",
        ],
      },
      {
        title: "Cambiar la gravedad",
        text: [
          "Con los tres botones de gravedad (o las teclas Q, S y E) la mandas a la pared de la izquierda, al techo o a la pared de la derecha. Caes hacia allá, la pantalla gira y esa superficie pasa a ser tu piso.",
          "Cada cambio gasta tu carga (el puntito amarillo sobre tu talo y el cartel «Gravedad lista»). Se recarga en cuanto tocas cualquier superficie, así que no puedes cambiarla dos veces seguidas en el aire.",
          "Si la mandas hacia una pared lejana, caes de costado: es la forma más rápida de cruzar un nivel… si sabes dónde vas a aterrizar.",
        ],
      },
      {
        title: "Lo que te vas a encontrar",
        text: [
          "Pinchos rojos: si los tocas, vuelves al último punto. Lo mismo si caes al vacío.",
          "Banderitas: son puntos de control; al pasar por una, ahí vuelves si te caes. R (o el botón de la flecha circular) te lleva ahí cuando quieras.",
          "Casillas azules con flecha: al cruzarlas, la gravedad cambia sola hacia donde apunta la flecha (y te recargan).",
          "Bloques agrietados: se rompen un momento después de pisarlos y vuelven a los pocos segundos.",
          "Plataformas verdes: se mueven; súbete y te llevan. En algunos niveles, además, la gravedad se da vuelta sola cada pocos segundos: un cartel te avisa justo antes.",
        ],
      },
      {
        title: "Solo y carreras",
        text: [
          "Solo: los niveles van en orden y cada uno enseña algo nuevo. Si llegas rápido te llevas hasta tres estrellas.",
          "Carrera (con amigos o en línea): todos juegan el mismo nivel a la vez y ven a los demás como fantasmas, que no chocan. El primero en llegar suma 3 puntos, el segundo 2 y el resto que llega 1. Si son pocos, completan bots.",
        ],
      },
    ],
    tips: [
      "Antes de cambiar la gravedad, mira hacia dónde vas a caer: la pared de enfrente pasa a ser el piso.",
      "Salta y cambia la gravedad en el aire para pasar por encima de los pinchos.",
      "En las carreras, los atajos existen: caer de costado de una pared a otra ahorra mucho tiempo.",
    ],
  },
  ladrillazo: {
    goal: "Romper ladrillos con la pelota sin dejarla caer: los objetivos rojos o todo el nivel, según cuál toque.",
    sections: [
      {
        title: "La paleta",
        text: [
          "Abajo tienes una paleta. En el teléfono, apoya el dedo en cualquier parte y arrástralo; en la computadora, mueve el mouse o usa las flechas. Para sacar, toca la pantalla, haz click o aprieta la barra espaciadora.",
          "Donde pega la pelota en la paleta decide para dónde sale: en el centro sale derecha para arriba y en las puntas sale abierta. Así se apunta.",
        ],
        art: "ladrillazo",
      },
      {
        title: "Los ladrillos",
        text: [
          "Los de color se rompen de un golpe; los blancos con el centro gris son duros y necesitan dos. Los muros grises no se rompen nunca: hay que rodearlos o meter la pelota por los huecos.",
          "Las bombas negras rompen todo lo que tienen alrededor (y otras bombas que toquen, en cadena). Los ladrillos blancos con dibujo sueltan un premio que cae: agárralo con la paleta. Azul: tres pelotas. Verde: paleta larga por un rato. Rosa: una vida más.",
        ],
      },
      {
        title: "El objetivo de cada nivel",
        text: [
          "Arriba de la cancha dice qué hay que hacer. En algunos niveles hay que romper todos los ladrillos; en otros alcanza con los objetivos rojos, que suelen estar escondidos detrás de muros, adentro de tubos o arriba de torres.",
          "Si se te cae la pelota pierdes una vida. Sin vidas, pierdes el nivel.",
        ],
      },
      {
        title: "Solo",
        text: [
          "La campaña tiene niveles cada vez más difíciles: pasa uno para abrir el siguiente. Cada nivel da hasta tres estrellas: una por pasarlo, otra si perdiste una vida como mucho y otra si lo hiciste rápido.",
          "En «Infinito» los niveles se inventan solos y nunca se terminan: cada uno que pasas te da una vida más y los puntos se acumulan hasta que te quedes sin vidas.",
        ],
      },
      {
        title: "Carrera",
        text: [
          "Todos juegan el mismo nivel, cada uno en su pantalla, y arriba ven los tableros de los demás en vivo. Gana el que lo termina primero. Si te quedas sin pelotas, el nivel vuelve a empezar desde cero, pero el reloj sigue.",
          "Cuando alguien termina, el resto tiene 30 segundos más. Si nadie llega, gana el que avanzó más.",
        ],
      },
      {
        title: "Ataque",
        text: [
          "Cada uno en su tablero, y la pared de ladrillos baja sola cada tantos segundos (cada vez más rápido). Si un ladrillo llega a la línea roja, o te quedas sin pelotas, quedas afuera.",
          "Romper muchos ladrillos entre dos toques de la paleta es un combo: con 4 le mandas una fila de ladrillos duros a otro jugador, con 8 dos filas y con 12 tres. Gana el último que queda en pie.",
        ],
      },
      {
        title: "Duelo",
        text: [
          "Dos jugadores en la misma cancha: uno abajo y otro arriba (cada uno se ve abajo en su pantalla), con ladrillos en el medio. Si la pelota pasa por detrás de tu rival, es gol tuyo. Gana el primero que llega a los goles elegidos.",
          "Si en la sala estás solo, juegas contra la computadora.",
        ],
      },
      {
        title: "En equipo",
        text: ["Hasta cuatro en la misma cancha contra un nivel. La parte de abajo se divide: cada uno cuida su franja con su paleta. Las vidas son de todos: si se acaban, pierden juntos."],
      },
      {
        title: "En línea",
        text: ["«Jugar en línea» te mete en rondas cortas con gente de todos lados, una atrás de la otra: casi siempre carreras y, cada tanto, un ataque. Si llegas en medio de una ronda, miras y entras en la siguiente. Si hay poca gente, completan unos bots."],
      },
    ],
    tips: [
      "Para llegar a un objetivo escondido, busca el hueco del muro y pégale a la pelota con la punta de la paleta para que salga en diagonal.",
      "Una pelota que entra detrás de los ladrillos rebota sola un buen rato rompiendo todo: abre un camino hacia arriba.",
      "En el ataque, no rompas de a uno: espera a tener la pelota arriba y deja que haga combo.",
    ],
  },
  carreras: {
    goal: "Completar las vueltas antes que los demás pilotos.",
    sections: [
      {
        title: "La pantalla y los volantes",
        text: [
          "Abre la sala en una computadora conectada a la tele o al proyector: ahí se ve la pista desde arriba.",
          "Cada piloto entra desde su teléfono con el código y elige un auto: el teléfono es su volante.",
        ],
      },
      {
        title: "Manejar",
        text: [
          "El auto acelera solo. Dobla con los botones de izquierda y derecha, o activa «inclinar» y gira el teléfono como un volante. El botón de freno frena y da marcha atrás.",
          "Las flechas de la pista te impulsan y las rampas te hacen volar. Chocar contra las paredes o los demás te frena.",
        ],
      },
      {
        title: "Bots",
        text: [
          "Si la sala tiene bots, los autos que nadie eligió los maneja la computadora. Se elige cuántos (hasta 3) y cómo manejan: fácil, normal o difícil.",
        ],
      },
    ],
    tips: ["Frena un poco antes de las curvas cerradas: sales más rápido."],
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
          "El auto acelera solo. Dobla con los botones o inclinando el teléfono; el freno frena y da marcha atrás. En la computadora, con las flechas (o A y D) y la flecha abajo o la barra espaciadora para frenar.",
          "Puedes cambiar la cámara: detrás del auto o desde la cabina. Las flechas del piso te impulsan y las rampas te hacen volar.",
        ],
      },
      {
        title: "Pistas",
        text: [
          "Hay pistas cortas para empezar y tres largas, solo en 3D: Gran Premio (un ocho con puente), Cañón (subidas y saltos en el desierto) y Nocturna (una ciudad de noche con autopista). También hay pistas armadas al azar.",
          "Los carteles con flechas rojas avisan las curvas cerradas: frena un poco antes.",
        ],
      },
      {
        title: "Bots y tiempos",
        text: [
          "Con bots, los autos que nadie eligió los maneja la computadora: elige cuántos (hasta 3) y cómo manejan (fácil, normal o difícil). Así se puede correr solo o completar la grilla.",
          "Cada vuelta te muestra su tiempo, y al final se ve la mejor vuelta de cada uno; la más rápida de la carrera queda marcada. Si das la vuelta al revés, aparece «¡Contramano!».",
        ],
      },
    ],
    tips: [
      "Si el juego va lento, baja la calidad gráfica desde el botón de la pantalla.",
      "Pasa por las flechas naranjas del piso: el turbo te da una buena ventaja en las rectas largas.",
    ],
  },
  arena: {
    goal: "Según el modo: que tu equipo quede en pie, ser el último caballero en pie, dominar la colina o aguantar la mayor cantidad de oleadas.",
    sections: [
      {
        title: "Modos",
        text: [
          "Equipos: rojo contra azul por rondas. Gana la ronda el equipo que queda en pie (si se acaba el tiempo, el que tiene más vida).",
          "Todos contra todos: de 3 a 8 caballeros, cada uno por su cuenta y cada uno con su color. Gana la ronda el último en pie (si se acaba el tiempo, el que derribó a más) y la partida quien gana las rondas pedidas.",
          "Rey de la colina: hay una zona marcada en el centro. Cada segundo que tu equipo la tiene solo suma un punto; si hay caballeros de los dos equipos, está en disputa y no suma nadie. Gana el primero en llegar a 45 o el que tiene más al terminar los 3 minutos. Si caes, vuelves a pelear a los pocos segundos desde tu lado.",
          "Supervivencia: hasta 4 personas juntas contra oleadas de bots, cada vez más y mejor armados. Entre oleadas se recupera vida y los caídos vuelven a pelear. Termina cuando caen todos: el puntaje son las oleadas que aguantaron.",
        ],
      },
      {
        title: "Arenas",
        text: [
          "Coliseo: la arena redonda, con columnas para cubrirte.",
          "Puente: un puente angosto sobre el abismo. La baranda tiene huecos: si te empujan por uno, caes y quedas afuera (y cuenta para quien te empujó). Las patadas, los golpes y el terremoto empujan más que en otras arenas.",
          "Patio del castillo: muros, cajas para cubrirte (a las bajas se puede subir de un salto) y pasarelas altas a los costados, a las que se sube por rampas. Desde arriba, el arco es muy útil.",
          "Bosque: un claro con troncos gruesos y rocas para esconderte, y el suelo desparejo.",
          "Foso de trampas: rejillas de fuego que se encienden y se apagan (brillan justo antes) y una cuchilla que gira en el centro: sáltala cuando llegue.",
          "Al crear la sala puedes elegir la arena o «Al azar» (una distinta cada partida).",
        ],
      },
      {
        title: "Eventos",
        text: [
          "Si la sala tiene eventos (en línea siempre), de vez en cuando pasa algo en medio de la ronda y se anuncia con un cartel:",
          "Lluvia de flechas: aparecen círculos rojos en el piso y a los pocos segundos caen flechas ahí. Sal de los círculos o levanta un escudo.",
          "La tribuna tira armas: caen armas nuevas en la arena.",
          "La arena se achica: un anillo de fuego se va cerrando; afuera pierdes vida de a poco. Después se vuelve a abrir.",
          "Niebla: por un rato no se ve más allá de unos metros.",
        ],
      },
      {
        title: "Armas",
        text: [
          "Empiezas con una daga. Por la arena hay espadas, hachas, mazas, martillos, manguales, lanzas, arcos y escudos: acércate y agárralos. Cada arma tiene su alcance y velocidad.",
          "El martillo es lento pero pesado: un golpe bloqueado casi vacía el aguante del rival. El mangual barre en arcos anchos y su cadena pasa en parte por encima de los escudos.",
          "Si la sala tiene pociones, las del piso te curan.",
        ],
      },
      {
        title: "Pelear",
        text: [
          "Ataca en el momento justo y vuelve a atacar durante el golpe para encadenar un combo. Bloquea de frente para frenar golpes (no los de atrás) y esquiva para escapar.",
          "Correr, bloquear, patear y esquivar gastan aguante: si se vacía, quedas expuesto.",
        ],
      },
      {
        title: "Parada perfecta, patada y especial",
        text: [
          "Parada perfecta: levanta el bloqueo justo antes de que te llegue el golpe. No te hace daño, no gastas aguante y el rival queda aturdido un momento: aprovecha para pegarle. Si bloqueas a cada rato, no cuenta.",
          "Patada: corta, rápida y de poco daño, pero ningún bloqueo la frena: si el rival se está cubriendo, le rompe la guardia y lo deja expuesto. Se puede esquivar y hay que esperar un poco entre una y otra.",
          "Golpe especial: la barra violeta se llena cuando pegas, bloqueas y, sobre todo, con paradas perfectas. Llena, lanza un golpe fuerte según tu arma: torbellino con espadas, dagas y manguales (pega alrededor), terremoto con hachas, mazas y martillos (golpe al suelo que empuja a todos; salta para evitarlo), estocada larga con la lanza y triple flecha con el arco. Brilla antes de salir: si lo ves venir, esquiva.",
        ],
      },
      {
        title: "Controles",
        text: [
          "Celular: joystick a la izquierda para moverte, arrastra la pantalla para mirar, y botones para atacar, bloquear, esquivar, saltar, patear, el golpe especial (se ilumina cuando está listo) y agarrar.",
          "Computadora: haz clic en la arena. WASD para moverte, mouse para mirar, Shift para correr, clic para atacar, clic derecho o F para bloquear, R o la rueda del mouse para patear, X para el golpe especial, Q para esquivar, espacio para saltar, E para agarrar, 1 a 4 para los gestos y V para cambiar la cámara.",
        ],
      },
      {
        title: "Niveles y desafíos",
        text: [
          "Cada batalla te da experiencia: más si ganas, derribas, haces paradas perfectas, bloqueas y pegas. Con la experiencia subes de nivel, y tu nivel aparece sobre tu caballero.",
          "Cada día hay tres desafíos nuevos (los mismos para todos), como «Gana 2 batallas» o «Derriba a 2 con el hacha». Cumplirlos da experiencia extra. Los ves en la página del juego, en «Tu caballero».",
          "Al subir de nivel se desbloquean penachos, emblemas para el escudo, cascos (cresta, cuernos, corona, alado) y títulos. Elígelos en «Personalizar»: solo cambian cómo te ven, no dan ventaja. Tu progreso queda en este dispositivo y, si entras con tu cuenta, también en ella.",
          "Al final de cada batalla ves los derribos, el daño, los bloqueos y las paradas de cada uno, quién fue el mejor (MVP) y cuánta experiencia ganaste.",
        ],
      },
      {
        title: "Gestos y anunciador",
        text: [
          "Saluda, festeja, búrlate o haz una reverencia: con las teclas 1 a 4, con el botón de la carita en el celular o con los gestos del control en pantalla grande. Todos ven a tu caballero hacerlo, con un globito arriba. No se puede en medio de un golpe y hay que esperar un poco entre uno y otro.",
          "Un anunciador canta los grandes momentos: el comienzo, el primer derribo, los dobles y triples, tus rachas, el último en pie, las remontadas y quién gana cada ronda. Si tu dispositivo tiene una voz en español, también lo dice en voz alta. Se silencia con el botón de sonido.",
        ],
      },
      {
        title: "En línea",
        text: [
          "Elige «En línea» y entras a una arena pública: peleas al toque con gente de todos lados. Cada batalla tiene un modo (equipos, todos contra todos o rey de la colina) y una arena al azar, con eventos. Las batallas van una detrás de otra; si llegas a mitad de una, miras y entras en la siguiente.",
        ],
      },
      {
        title: "En pantalla grande",
        text: [
          "Al crear la sala, elige «En una pantalla grande»: el combate se ve en una computadora conectada a la tele o al proyector, y cada uno entra desde su celular con el código.",
          "La pantalla se divide: cada persona (hasta 4) tiene su parte, con la cámara detrás de su caballero. Con más de 4 personas, se ve toda la arena desde arriba.",
          "El celular es el control, como cuando juegas en el celular: joystick para moverte (a fondo hacia adelante es correr) y arrastrar el dedo en la mitad derecha para mirar; tu caballero mira y pega hacia donde apunta tu cámara. «Atacar» y «Bloquear» se mantienen apretados, y «Esquivar», «Saltar», «Patada», el golpe especial y «Agarrar» se tocan. El celular muestra tu barra de especial y vibra cuando te pegan.",
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
          "Da una pista: una palabra, una cosa o un personaje que, para quien la da, esté justo en ese punto. No vale usar números.",
          "Si la escala no le sirve, puede pedir otra antes de dar la pista.",
        ],
        art: "onda",
      },
      {
        title: "Adivinar",
        text: [
          "Los demás mueven la aguja del dial: arrastrándola, con los botones − y + para afinar, o con las flechas del teclado en la computadora.",
          "Cuanto más cerca del objetivo, más puntos: 4 en el centro (la zona amarilla), 3 al lado y 2 un poco más lejos.",
          "Al revelar se abre la tapa del dial y se ve dónde estaba el objetivo.",
        ],
      },
      {
        title: "Tres formas de jugar",
        text: [
          "Cada uno por su cuenta: cada uno mueve su aguja en secreto y suma sus puntos; el que dio la pista suma el promedio de los demás. Ideal de a dos o para competir.",
          "Todos juntos: hay una sola aguja y la mueven entre todos (todos la ven moverse en vivo). La discuten y cualquiera confirma. Suman en equipo y al final ven su sintonía: qué porcentaje de los puntos posibles lograron.",
          "Rojo contra azul: los turnos van alternando entre los equipos. El equipo que juega ubica su aguja; después el otro equipo apuesta si el objetivo está más a la izquierda o más a la derecha de esa aguja, y si acierta suma 1. Se necesitan al menos 2 por equipo.",
        ],
      },
      {
        title: "Turnos y final",
        text: [
          "Todos dan la pista la cantidad de vueltas elegida. Si alguien entra con la partida empezada, también le toca dar pista.",
          "Si la sala tiene tiempo, al terminarse se toma la aguja como esté. Al final se ve un repaso de cada turno: la escala, la pista y cómo les fue.",
        ],
      },
    ],
    tips: [
      "Piensa en qué piensan los demás, no solo tú: una pista muy personal puede despistar.",
      "Si el objetivo está en un extremo, busca algo bien exagerado; si está en el medio, algo bien neutro.",
      "Se pueden escribir escalas propias al crear la sala: «Plan aburrido | Plan ideal».",
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
          "Tiras el dado y mueves una ficha esa cantidad. Con un 5 sacas una ficha de casa (si puedes, es obligatorio). Con un 6 vuelves a tirar; si ya no tienes fichas en casa, el 6 cuenta 7. Tres 6 seguidos: la última ficha que moviste vuelve a casa.",
          "Dos fichas de tu color en la misma casilla forman una barrera: nadie puede pasar, ni siquiera tú. Con un 6 estás obligado a abrirla.",
        ],
      },
      {
        title: "Comer y llegar",
        text: [
          "Si caes en la casilla de una ficha rival que está sola y no es un seguro, te la comes: vuelve a su casa y tú cuentas 20 con la ficha que quieras.",
          "Para entrar a la meta necesitas el número justo. Cada ficha que llega te da 10 casillas de premio para otra ficha.",
        ],
      },
      {
        title: "Ludo clásico",
        text: ["Si la sala es de Ludo clásico: se sale con un 6, las estrellas son los seguros, no hay barreras y comer o llegar a la meta te da otra tirada."],
        art: "ludo",
      },
    ],
    tips: ["Una barrera justo delante de la salida de un rival lo deja trabado.", "Antes de mover, fíjate qué fichas rivales tienes a menos de 6 casillas detrás."],
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
    tips: ["Si eres la vidente, cuidado con revelar lo que sabes demasiado pronto: los lobos te van a buscar."],
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
      {
        title: "En línea",
        text: ["¿No tienes con quién jugar? Elige «En línea» y te emparejamos al momento con alguien que también quiere jugar. Los colores se sortean y en cada revancha se cambian."],
      },
    ],
    tips: ["En la app, toca una pieza para ver sus casillas posibles: no te deja hacer jugadas ilegales."],
  },
  chinchon: {
    goal: "No pasarte del límite de puntos: el último que queda adentro gana.",
    sections: [
      {
        title: "Tu turno",
        text: ["Tienes 7 cartas. Agarra una del mazo o la de arriba del pozo, y después tira una al pozo (no la misma que levantaste del pozo)."],
      },
      {
        title: "Ligar",
        text: [
          "Junta piernas (3 o 4 cartas del mismo número) y escaleras (3 o más seguidas del mismo palo). Los comodines reemplazan cualquier carta.",
        ],
        art: "chinchon",
      },
      {
        title: "Cortar",
        text: [
          "Puedes cortar cuando tienes todo ligado salvo, como mucho, una carta de 5 o menos. Las cartas sueltas de cada uno suman puntos (sus números). Cortar con todo ligado resta 10.",
          "Un chinchón (siete cartas seguidas del mismo palo, sin comodines) gana la partida en el acto. Quien pasa el límite queda afuera.",
        ],
      },
    ],
  },
  truco: {
    goal: "Llegar primero a los puntos pedidos (15 o 30), ganando manos, envidos y trucos.",
    sections: [
      {
        title: "Las cartas",
        text: ["Cada uno recibe tres cartas. En cada baza todos tiran una carta y gana la más alta según el orden del truco (abajo). Gana la mano quien gana dos de las tres bazas; si empatan una baza (parda), la define la siguiente."],
        art: "truco",
      },
      {
        title: "El envido",
        text: [
          "Solo en la primera baza, antes de tirar tu carta, puedes cantar envido, real envido o falta envido. Se compara el envido de cada uno:",
          "Con dos cartas del mismo palo: 20 + la suma de las dos (las figuras 10, 11 y 12 valen 0). Si no, vale la carta más alta. La app lo calcula por ti.",
        ],
      },
      {
        title: "El truco",
        text: [
          "En cualquier momento de tu turno puedes cantar truco (la mano vale 2). El rival contesta quiero, no quiero (y tú sumas 1) o sube a retruco (3); y después vale cuatro (4).",
          "Si no te conviene seguir, puedes irte al mazo: el rival gana lo que valía la mano.",
        ],
      },
    ],
    tips: ["El 1 de espada y el 1 de basto son las cartas más fuertes: si los tienes, canta truco con confianza."],
  },
  fuego: {
    goal: "Ganar el modo que eligieron: más bajas, sobrevivir a los infectados, completar la escalada, capturar banderas o aguantar con el huevo dorado.",
    sections: [
      {
        title: "Talos de pintura",
        text: [
          "Cada jugador es su talo, con los ojos que reaccionan: se achinan cuando le pegan, sonríen cuando eliminan a alguien y quedan en X cuando cae. Todo dispara pintura del color de quien dispara, y el mapa se va llenando de manchas.",
          "Empiezas con rociador, pistola y dos globos de pintura. Por el mapa hay salpicadora, francotirador y lanzaglobos; llevas dos a la vez (agarrar una cambia la que tienes en la mano).",
          "La burbuja (el escudo) absorbe los primeros golpes y se recarga sola si dejan de pegarte; la vida solo vuelve con botiquines. Al reaparecer quedas protegido dos segundos.",
        ],
      },
      {
        title: "Modos",
        text: [
          "Todos contra todos y Rojos contra azules: gana quien llega primero a las bajas pedidas.",
          "Infectados: unos pocos empiezan infectados (verdes, sin arma y más rápidos) y contagian de un manotazo; quien cae se suma a ellos. Los sobrevivientes ganan si aguanta alguno hasta el final.",
          "Escalada: cada baja te cambia el arma por la siguiente de la lista. La última es el manotazo: una baja con él y ganas.",
          "Atrapa la bandera: lleva la bandera rival a tu base mientras la tuya está en casa. Si cae quien la lleva, queda en el piso: tócala para devolverla a tu base. Gana el primero en hacer 3 capturas.",
          "El tesoro: un huevo dorado con ojos. Mientras lo tienes sumas segundos y todos te ven en el radar; si te eliminan, lo sueltas. Gana quien junte 60.",
        ],
      },
      {
        title: "Caos cada minuto",
        text: [
          "Si está activado, cada minuto pasa algo por 25 segundos, igual para todos: gravedad baja, turbo, ojos saltones (tiros a la cabeza más fáciles), solo salpicadoras, munición infinita, fantasmas (solo se ven los ojos hasta que disparan), lluvia de globos de pintura o bajas dobles. Se anuncia unos segundos antes.",
        ],
      },
      {
        title: "Habilidades",
        text: [
          "Antes de empezar, cada uno elige una: Impulso (un empujón rápido), Supersalto, Teletransporte (7 metros adelante), Radar (ves a todos los rivales unos segundos) o Burbuja (escudo lleno y 50 extra). Se usa con C o con su botón, y después hay que esperar a que se recargue.",
        ],
      },
      {
        title: "Rachas y medallas",
        text: [
          "Cada baja seguida sin caer suma a tu racha: a las 5 eres imparable y a las 10, leyenda. La tabla guarda la mejor racha de cada uno.",
          "También hay medallas por la primera baja de la partida, por eliminar a quien te eliminó (venganza), por bajas dobles y triples, por tiros a la cabeza y por manotazos. Cuando alguien queda a punto de ganar, todos lo ven.",
        ],
      },
      {
        title: "En una pantalla grande",
        text: [
          "Al crear la sala elige «En una pantalla grande»: la partida se ve en una computadora conectada a la tele, con la pantalla dividida para hasta 4 personas, cada una en primera persona. Los demás lugares los ocupan bots.",
          "Cada celular es el control de su talo: joystick a la izquierda, arrastra a la derecha para mirar, y botones para disparar (si lo arrastras, también miras), apuntar, la habilidad, saltar, recargar, cambiar de arma, globo, golpe y agarrar. El celular muestra tu escudo, tu vida y tu munición, y vibra cuando te pegan.",
        ],
      },
      {
        title: "Controles",
        text: [
          "Computadora: haz clic en el juego. WASD para moverte, mouse para mirar, clic para disparar, clic derecho para apuntar, C usa la habilidad, R recarga, Q / 1 / 2 o la rueda cambian de arma, G tira un globo, F o V golpea, E agarra, espacio salta y Tab muestra el puntaje.",
          "Celular: joystick para moverte, arrastra para mirar, botón de disparo (si lo arrastras, también miras), y botones para apuntar, la habilidad, saltar, recargar y globos. El francotirador apunta mientras mantienes y dispara al soltar.",
        ],
      },
    ],
    tips: [
      "Si te quedas sin escudo, cúbrete unos segundos antes de volver a pelear.",
      "Al caer verás con qué te eliminaron y cuánta vida le quedaba al otro: si quedó débil, ve a buscarlo.",
      "En la lluvia de globos, no te quedes quieto: mira las sombras que caen.",
    ],
  },

  otelo: {
    goal: "Terminar con más fichas de tu color en el tablero.",
    sections: [
      {
        title: "Jugar una ficha",
        text: [
          "En tu turno pones una ficha que encierre, en línea recta o diagonal, una o más fichas rivales entre la nueva y otra tuya. Todas las encerradas se dan vuelta y pasan a ser tuyas.",
          "Solo puedes jugar donde encierras al menos una: la app te marca esas casillas.",
        ],
        art: "otelo",
      },
      { title: "Final", text: ["Si no tienes jugada, pasas. Cuando ninguno puede jugar (o se llena el tablero), gana quien tiene más fichas."] },
      {
        title: "En línea",
        text: ["¿No tienes con quién jugar? Elige «En línea» y te emparejamos al momento con alguien que también quiere jugar. Los colores se sortean y en cada revancha se cambian."],
      },
    ],
    tips: ["Las esquinas nunca se pueden dar vuelta: son las casillas más valiosas.", "Evita jugar en las casillas pegadas a una esquina vacía: le abres la esquina al rival."],
  },
  triqui: {
    goal: "Hacer tres en línea con tu marca antes que el rival.",
    sections: [
      {
        title: "Tu turno",
        text: [
          "Uno juega con X y el otro con O; empieza la X. En tu turno pones tu marca en cualquier casilla libre.",
          "Gana el primero que completa una fila, una columna o una diagonal con tres de las suyas.",
        ],
      },
      { title: "Modo clásico", text: ["Si se llena el tablero y nadie hizo tres en línea, es empate."] },
      {
        title: "Modo infinito",
        text: [
          "Cada uno tiene como mucho tres marcas en el tablero: cuando pones la cuarta, se borra tu marca más vieja. Así nunca se llena y no hay empates.",
          "La marca que vas a perder con tu próxima jugada titila, para que la tengas en cuenta.",
        ],
        art: "triqui",
      },
      { title: "Revancha", text: ["En cada revancha se cambian X y O, así arranca uno y después el otro. La app lleva la cuenta de ganadas."] },
      {
        title: "En línea",
        text: ["¿No tienes con quién jugar? Elige «En línea» y te emparejamos al momento con alguien que también quiere jugar. Se sortea quién juega con X y en cada revancha se cambian."],
      },
    ],
    tips: [
      "Si empiezas, el centro o una esquina son las mejores primeras jugadas.",
      "Busca armar dos amenazas a la vez: el rival solo puede tapar una.",
      "En el infinito, fíjate cuál marca te va a desaparecer antes de contar con ella para la línea.",
    ],
  },
  backgammon: {
    goal:"Llevar tus 15 fichas a tu casa y sacarlas del tablero antes que el rival.",
    sections: [
      {
        title: "Hacia dónde se mueve",
        text: [
          "Cada uno mueve en sentido contrario. Tú mueves de los puntos altos (24) a los bajos (1): tu casa son los puntos 1 a 6, abajo a la derecha. El tablero siempre se ve desde tu lado.",
        ],
        art: "backgammon",
      },
      {
        title: "Tu turno",
        text: [
          "Tiras dos dados y mueves una ficha por cada dado (puede ser la misma dos veces). Los dobles valen cuatro movimientos.",
          "No puedes caer en un punto con dos o más fichas rivales. Tienes que usar todos los dados que puedas; si solo puedes usar uno, tiene que ser el mayor.",
          "En la app: toca una ficha (se marcan en celeste las que se pueden mover) y después el punto verde a donde va. Puedes deshacer antes de tocar «Listo».",
        ],
      },
      {
        title: "Comer y la barra",
        text: [
          "Si caes en un punto con una sola ficha rival, la comes: va a la barra del medio. Quien tiene fichas en la barra tiene que hacerlas entrar por la casa del rival antes de mover cualquier otra.",
        ],
      },
      {
        title: "Sacar fichas y ganar",
        text: [
          "Cuando tus 15 fichas están en tu casa, empiezas a sacarlas con el número exacto del punto (o con uno más alto si no hay fichas más atrás).",
          "Ganar vale 1 punto; 2 (gammon) si el rival no sacó ninguna; 3 (backgammon) si además le queda alguna en la barra o en tu casa.",
        ],
      },
      {
        title: "El cubo de doblaje",
        text: ["Antes de tirar, puedes ofrecer doblar lo que vale la partida. El rival acepta (y el cubo pasa a ser suyo: solo él puede volver a doblar) o se rinde y pierde lo que valía hasta ahí."],
      },
      {
        title: "En línea",
        text: ["¿No tienes con quién jugar? Elige «En línea» y te emparejamos al momento con alguien que también quiere jugar, en un partido a 3 puntos. Los colores se sortean y en cada revancha se cambian."],
      },
    ],
    tips: ["Dos fichas juntas en un punto lo bloquean: arma varios puntos seguidos para encerrar al rival."],
  },
  oca: {
    goal: "Llegar primero al jardín de la Oca, la casilla 63.",
    sections: [
      { title: "Tu turno", text: ["Tira los dados y tu ficha avanza sola. Si caes en una casilla especial, pasa lo que dice."] },
      {
        title: "Las casillas",
        text: [
          "🪿 Oca: «de oca a oca y tiro porque me toca»: saltas a la próxima oca y vuelves a tirar.",
          "🌉 Puentes (6 y 12) y 🎲 dados (26 y 53): vas al otro y vuelves a tirar.",
          "🏨 Posada (19): pierdes un turno. ⛓️ Cárcel (52): pierdes dos. 🕳️ Pozo (31): quedas ahí hasta que caiga otro y te rescate.",
          "🌀 Laberinto (42): vuelves a la 30. 💀 Calavera (58): vuelves al principio.",
        ],
        art: "oca",
      },
      { title: "Llegar", text: ["Para entrar al jardín (63) hace falta el número justo: lo que sobra, retrocede. Con dos dados, si en tu primera tirada sacas 6 y 3 vas directo a la 26, y con 4 y 5, a la 53."] },
    ],
  },
  pasteleria: {
    goal: "Preparar cada torta exactamente como la pidió el cliente, antes de que se acabe el tiempo: solo, para pasar los cuatro niveles; en el duelo, para hacer más puntos que los demás.",
    sections: [
      {
        title: "El pedido",
        text: [
          "Arriba (o a la derecha en la computadora) está el pedido: quién lo pide, un dibujo de la torta y la lista de lo que quiere: forma, bizcocho, pisos, relleno, cobertura y decoración.",
          "En los niveles altos el pedido viene sin dibujo, solo la lista. En Chef estrella, además, se esconde a los 8 segundos: memorízalo. Puedes volver a mirarlo un momento, pero cada vistazo le resta 20 puntos a esa torta.",
        ],
      },
      {
        title: "Armar la torta",
        text: [
          "Elige cada paso en las pestañas de abajo: la torta en 3D cambia con cada elección. Arrástrala para girarla y ver los pisos.",
          "El relleno va entre los pisos, así que solo aparece con 2 pisos o más. En los dos últimos niveles se piden dos decoraciones.",
          "En la computadora: los números eligen una opción, las flechas cambian de paso, Enter entrega y Esc pausa.",
        ],
      },
      {
        title: "Entregar",
        text: [
          "Cuando está todo, toca «Entregar la torta». Si es igual al pedido sumas 100 puntos, más un extra por racha de tortas perfectas y por los segundos que te sobran del reloj.",
          "Si algo no coincide, la app te dice qué. Hasta el nivel Maestro puedes arreglarla una vez (vale 40) o pasar al siguiente pedido; en Chef estrella no hay segunda oportunidad. Si se acaba el tiempo, el pedido se pierde.",
        ],
      },
      {
        title: "Niveles (solo)",
        text: [
          "Aprendiz: un piso, redonda o cuadrada, 60 segundos por torta. Pastelero: hasta dos pisos con relleno, 50 segundos. Maestro: dos o tres pisos, dos decoraciones y el pedido sin dibujo, 45 segundos. Chef estrella: el pedido se esconde, 40 segundos y sin arreglos.",
          "Para pasar de nivel hace falta armar bien al menos 3 de 5 pedidos (4 de 6 en los últimos). Tres estrellas si salen todas perfectas de una.",
        ],
      },
      {
        title: "Duelo con amigos",
        text: [
          "Desde el inicio, «Duelo con amigos» crea una sala: eliges la dificultad (la de uno de los niveles) y cuánto dura el turno (2, 3 o 5 minutos), y mandas el link.",
          "Todos reciben los mismos pedidos en el mismo orden y arrancan juntos después de una cuenta regresiva. No hay reloj por torta: el reloj es el del turno. Cada torta bien suma como en el juego solo; cada torta mal resta 25 y pasas al pedido siguiente igual.",
          "Arriba ves los puntos de todos y la torta que cada uno tiene en la mesada. Cuando suena la campana gana quien sumó más.",
        ],
      },
    ],
    tips: [
      "Antes de entregar, gira la torta y compara con el pedido.",
      "En el duelo, apurarse con una torta mal cuesta más que tardar unos segundos en revisarla.",
      "La música, el volumen y la calidad gráfica se cambian en la pausa.",
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
          "Pon una ficha que tenga el mismo número que una de las dos puntas de la mesa. Si entra en las dos puntas, la app te pregunta en cuál.",
          "Si no tienes ficha que entre: de a 2 o 3 robas del pozo hasta que te salga una; si el pozo está vacío (o juegan de a 4), pasas.",
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
      {
        title: "En línea",
        text: ["¿No tienes con quién jugar? Elige «En línea» y te emparejamos al momento con alguien que también quiere jugar: mano a mano, con pozo, a 100 puntos."],
      },
    ],
    tips: ["Sácate de encima primero las fichas con números altos: si se tranca, pesan menos.", "Fíjate qué números va pasando el rival: no los tiene."],
  },
};
