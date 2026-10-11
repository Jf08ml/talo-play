/**
 * Trivia question bank. `a[0]` is always the right answer; the options are
 * shuffled per question when shown. A game's questions are picked by index
 * from the room's seed, so only append to this list: reordering or removing
 * questions changes the questions of rooms already created.
 */

export type TriviaCategory = "geografia" | "historia" | "ciencia" | "deportes" | "entretenimiento" | "arte";

export const TRIVIA_CATEGORIES: { id: TriviaCategory; label: string; emoji: string; color: string }[] = [
  { id: "geografia", label: "Geografía", emoji: "🌎", color: "#3b82f6" },
  { id: "historia", label: "Historia", emoji: "📜", color: "#eab308" },
  { id: "ciencia", label: "Ciencia", emoji: "🔬", color: "#22c55e" },
  { id: "deportes", label: "Deportes", emoji: "⚽", color: "#f97316" },
  { id: "entretenimiento", label: "Entretenimiento", emoji: "🎬", color: "#ec4899" },
  { id: "arte", label: "Arte y literatura", emoji: "🎨", color: "#a855f7" },
];

export interface TriviaQuestion {
  cat: TriviaCategory;
  q: string;
  /** Four options, the right one first. */
  a: [string, string, string, string];
}

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  // Geografía
  { cat: "geografia", q: "¿Cuál es la capital de Australia?", a: ["Canberra", "Sídney", "Melbourne", "Perth"] },
  { cat: "geografia", q: "¿Cuál es el río más largo de Sudamérica?", a: ["Amazonas", "Paraná", "Orinoco", "Magdalena"] },
  { cat: "geografia", q: "¿En qué país está Machu Picchu?", a: ["Perú", "Bolivia", "Ecuador", "Chile"] },
  { cat: "geografia", q: "¿Cuál es el océano más grande del mundo?", a: ["Pacífico", "Atlántico", "Índico", "Ártico"] },
  { cat: "geografia", q: "¿Cuál es la montaña más alta de América?", a: ["Aconcagua", "Chimborazo", "Denali", "Ojos del Salado"] },
  { cat: "geografia", q: "¿Cuál es la capital de Canadá?", a: ["Ottawa", "Toronto", "Montreal", "Vancouver"] },
  { cat: "geografia", q: "¿Qué país tiene forma de bota?", a: ["Italia", "Grecia", "Portugal", "Croacia"] },
  { cat: "geografia", q: "¿Cuál es el desierto cálido más grande del mundo?", a: ["Sahara", "Gobi", "Kalahari", "Atacama"] },
  { cat: "geografia", q: "¿Cuántos países independientes hay en Sudamérica?", a: ["12", "10", "14", "9"] },
  { cat: "geografia", q: "¿Cuál es la capital de Japón?", a: ["Tokio", "Kioto", "Osaka", "Seúl"] },
  { cat: "geografia", q: "¿En qué continente está Egipto?", a: ["África", "Asia", "Europa", "Oceanía"] },
  { cat: "geografia", q: "¿Qué cataratas están en la frontera entre Argentina y Brasil?", a: ["Iguazú", "Niágara", "Victoria", "Salto Ángel"] },
  { cat: "geografia", q: "¿Cuál es el país más grande del mundo por superficie?", a: ["Rusia", "Canadá", "China", "Estados Unidos"] },
  { cat: "geografia", q: "¿Cuál es la capital de Uruguay?", a: ["Montevideo", "Punta del Este", "Colonia", "Salto"] },
  { cat: "geografia", q: "¿Cuál es el país con más habitantes del mundo?", a: ["India", "China", "Estados Unidos", "Indonesia"] },
  { cat: "geografia", q: "¿Cuál es la capital de Brasil?", a: ["Brasilia", "Río de Janeiro", "São Paulo", "Salvador"] },
  { cat: "geografia", q: "¿Qué lago es considerado el navegable más alto del mundo?", a: ["Titicaca", "Victoria", "Baikal", "Nahuel Huapi"] },
  { cat: "geografia", q: "¿Qué océano baña las costas de Chile?", a: ["Pacífico", "Atlántico", "Índico", "Ártico"] },
  { cat: "geografia", q: "¿En qué ciudad está la Torre Eiffel?", a: ["París", "Londres", "Roma", "Bruselas"] },
  { cat: "geografia", q: "¿Cuál es la capital de Colombia?", a: ["Bogotá", "Medellín", "Cali", "Cartagena"] },

  // Historia
  { cat: "historia", q: "¿En qué año llegó Colón a América?", a: ["1492", "1500", "1453", "1519"] },
  { cat: "historia", q: "¿En qué año empezó la Primera Guerra Mundial?", a: ["1914", "1918", "1939", "1905"] },
  { cat: "historia", q: "¿En qué año terminó la Segunda Guerra Mundial?", a: ["1945", "1939", "1950", "1918"] },
  { cat: "historia", q: "¿En qué año llegó el ser humano a la Luna por primera vez?", a: ["1969", "1961", "1972", "1957"] },
  { cat: "historia", q: "¿Quién fue el primer presidente de Estados Unidos?", a: ["George Washington", "Abraham Lincoln", "Thomas Jefferson", "John Adams"] },
  { cat: "historia", q: "¿Qué civilización construyó Machu Picchu?", a: ["Inca", "Maya", "Azteca", "Olmeca"] },
  { cat: "historia", q: "¿En qué año cayó el Muro de Berlín?", a: ["1989", "1991", "1985", "1975"] },
  { cat: "historia", q: "¿Qué fecha recuerda la Revolución de Mayo en Argentina?", a: ["25 de mayo de 1810", "9 de julio de 1816", "20 de junio de 1820", "1 de mayo de 1853"] },
  { cat: "historia", q: "¿En qué año declaró Argentina su independencia?", a: ["1816", "1810", "1820", "1806"] },
  { cat: "historia", q: "¿Quién cruzó los Andes con su ejército para liberar Chile?", a: ["José de San Martín", "Simón Bolívar", "Manuel Belgrano", "José Gervasio Artigas"] },
  { cat: "historia", q: "¿Qué emperador francés fue derrotado en Waterloo?", a: ["Napoleón Bonaparte", "Luis XIV", "Carlomagno", "Luis XVI"] },
  { cat: "historia", q: "¿En qué ciudad está el Coliseo?", a: ["Roma", "Atenas", "Estambul", "Nápoles"] },
  { cat: "historia", q: "¿Qué barco se hundió en 1912 en su viaje inaugural?", a: ["Titanic", "Lusitania", "Britannic", "Queen Mary"] },
  { cat: "historia", q: "¿Qué pueblo tenía su capital en Tenochtitlan?", a: ["Los aztecas", "Los incas", "Los mayas", "Los olmecas"] },
  { cat: "historia", q: "¿Quién fue el primer ser humano en viajar al espacio?", a: ["Yuri Gagarin", "Neil Armstrong", "Buzz Aldrin", "John Glenn"] },
  { cat: "historia", q: "¿En qué país comenzó la Revolución Industrial?", a: ["Gran Bretaña", "Francia", "Alemania", "Estados Unidos"] },
  { cat: "historia", q: "¿Quién creó la bandera argentina?", a: ["Manuel Belgrano", "José de San Martín", "Domingo F. Sarmiento", "Mariano Moreno"] },
  { cat: "historia", q: "¿En qué país están las pirámides de Guiza?", a: ["Egipto", "México", "Sudán", "Perú"] },
  { cat: "historia", q: "¿Qué país le regaló la Estatua de la Libertad a Estados Unidos?", a: ["Francia", "Inglaterra", "España", "Italia"] },
  { cat: "historia", q: "¿En qué año comenzó la Revolución Francesa?", a: ["1789", "1776", "1810", "1848"] },

  // Ciencia
  { cat: "ciencia", q: "¿Cuál es el símbolo químico del oro?", a: ["Au", "Ag", "Or", "Go"] },
  { cat: "ciencia", q: "¿Cuál es el planeta más grande del sistema solar?", a: ["Júpiter", "Saturno", "Neptuno", "Urano"] },
  { cat: "ciencia", q: "¿Cuántos huesos tiene el cuerpo de un adulto?", a: ["206", "180", "250", "212"] },
  { cat: "ciencia", q: "¿Qué gas absorben las plantas para hacer la fotosíntesis?", a: ["Dióxido de carbono", "Oxígeno", "Nitrógeno", "Helio"] },
  { cat: "ciencia", q: "¿A qué temperatura hierve el agua a nivel del mar?", a: ["100 °C", "90 °C", "120 °C", "80 °C"] },
  { cat: "ciencia", q: "¿Cuál es el planeta más cercano al Sol?", a: ["Mercurio", "Venus", "Marte", "Tierra"] },
  { cat: "ciencia", q: "¿Qué órgano bombea la sangre por el cuerpo?", a: ["El corazón", "Los pulmones", "El hígado", "Los riñones"] },
  { cat: "ciencia", q: "¿Cuál es la fórmula química del agua?", a: ["H₂O", "CO₂", "O₂", "H₂O₂"] },
  { cat: "ciencia", q: "¿Quién formuló la teoría de la relatividad?", a: ["Albert Einstein", "Isaac Newton", "Galileo Galilei", "Stephen Hawking"] },
  { cat: "ciencia", q: "¿Cuántas patas tiene una araña?", a: ["8", "6", "10", "12"] },
  { cat: "ciencia", q: "¿Cuál es el animal terrestre más rápido?", a: ["El guepardo", "El león", "El antílope", "El caballo"] },
  { cat: "ciencia", q: "¿Cuál es el órgano más grande del cuerpo humano?", a: ["La piel", "El hígado", "El cerebro", "Los intestinos"] },
  { cat: "ciencia", q: "¿Qué planeta es conocido como el planeta rojo?", a: ["Marte", "Júpiter", "Venus", "Saturno"] },
  { cat: "ciencia", q: "¿Cuál es el animal más grande del mundo?", a: ["La ballena azul", "El elefante africano", "El cachalote", "El tiburón ballena"] },
  { cat: "ciencia", q: "¿Qué vitamina produce el cuerpo con la luz del sol?", a: ["Vitamina D", "Vitamina C", "Vitamina A", "Vitamina B12"] },
  { cat: "ciencia", q: "¿Cuántos cromosomas tiene una célula humana normal?", a: ["46", "23", "44", "48"] },
  { cat: "ciencia", q: "¿Cuál es el metal más abundante en la corteza terrestre?", a: ["Aluminio", "Hierro", "Cobre", "Oro"] },
  { cat: "ciencia", q: "¿Cuál es, aproximadamente, la velocidad de la luz?", a: ["300.000 km/s", "30.000 km/s", "3.000 km/s", "3.000.000 km/s"] },
  { cat: "ciencia", q: "¿En qué parte de la célula está la mayor parte del ADN?", a: ["El núcleo", "La membrana", "El citoplasma", "La pared celular"] },
  { cat: "ciencia", q: "¿Cuántos planetas tiene el sistema solar?", a: ["8", "9", "7", "10"] },

  // Deportes
  { cat: "deportes", q: "¿Cada cuántos años se juega el Mundial de fútbol?", a: ["4", "2", "3", "5"] },
  { cat: "deportes", q: "¿Qué país ganó el Mundial de fútbol de Qatar 2022?", a: ["Argentina", "Francia", "Brasil", "Croacia"] },
  { cat: "deportes", q: "¿Cuántos jugadores tiene en la cancha un equipo de fútbol?", a: ["11", "10", "9", "12"] },
  { cat: "deportes", q: "¿Qué deporte se juega en Wimbledon?", a: ["Tenis", "Golf", "Críquet", "Pádel"] },
  { cat: "deportes", q: "¿Cuántos jugadores tiene en la cancha un equipo de básquet?", a: ["5", "6", "7", "4"] },
  { cat: "deportes", q: "¿Qué país ganó más Mundiales de fútbol masculino?", a: ["Brasil", "Alemania", "Italia", "Argentina"] },
  { cat: "deportes", q: "¿Cuánto dura un partido de fútbol, sin contar el descuento?", a: ["90 minutos", "80 minutos", "100 minutos", "60 minutos"] },
  { cat: "deportes", q: "¿En qué deporte se hizo famoso Michael Jordan?", a: ["Básquet", "Béisbol", "Fútbol americano", "Golf"] },
  { cat: "deportes", q: "¿Cada cuántos años se hacen los Juegos Olímpicos de verano?", a: ["4", "2", "5", "3"] },
  { cat: "deportes", q: "¿Cuántos anillos tiene la bandera olímpica?", a: ["5", "4", "6", "7"] },
  { cat: "deportes", q: "¿Qué tenista argentino ganó el US Open en 2009?", a: ["Juan Martín del Potro", "Guillermo Vilas", "David Nalbandian", "Gastón Gaudio"] },
  { cat: "deportes", q: "¿Qué deporte juegan Los Pumas?", a: ["Rugby", "Hockey", "Básquet", "Vóley"] },
  { cat: "deportes", q: "¿Cuántos puntos vale un try en rugby?", a: ["5", "3", "7", "4"] },
  { cat: "deportes", q: "¿Qué selección ganó el Mundial de fútbol de Sudáfrica 2010?", a: ["España", "Países Bajos", "Alemania", "Uruguay"] },
  { cat: "deportes", q: "¿Qué deporte es el Tour de France?", a: ["Ciclismo", "Automovilismo", "Atletismo", "Vela"] },
  { cat: "deportes", q: "¿Qué piloto igualó los 7 títulos de Fórmula 1 de Michael Schumacher?", a: ["Lewis Hamilton", "Ayrton Senna", "Sebastian Vettel", "Fernando Alonso"] },
  { cat: "deportes", q: "¿Cuántos sets hay que ganar para llevarse un partido de vóley?", a: ["3", "2", "4", "5"] },
  { cat: "deportes", q: "¿En qué país nació el fútbol moderno?", a: ["Inglaterra", "Brasil", "Italia", "Uruguay"] },
  { cat: "deportes", q: "¿Qué país ganó el primer Mundial de fútbol, en 1930?", a: ["Uruguay", "Argentina", "Brasil", "Italia"] },
  { cat: "deportes", q: "¿Cómo se llama la selección femenina de hockey de Argentina?", a: ["Las Leonas", "Las Panteras", "Las Pumas", "Las Águilas"] },
  { cat: "deportes", q: "¿Cuántos hoyos tiene un recorrido completo de golf?", a: ["18", "9", "12", "21"] },

  // Entretenimiento
  { cat: "entretenimiento", q: "¿Cómo se llama el vaquero de Toy Story?", a: ["Woody", "Buzz", "Andy", "Slinky"] },
  { cat: "entretenimiento", q: "¿Qué banda grabó «Bohemian Rhapsody»?", a: ["Queen", "The Beatles", "The Rolling Stones", "Led Zeppelin"] },
  { cat: "entretenimiento", q: "¿Cómo se llama el joven mago creado por J. K. Rowling?", a: ["Harry Potter", "Gandalf", "Merlín", "Frodo"] },
  { cat: "entretenimiento", q: "¿Qué superhéroe es Peter Parker?", a: ["Spider-Man", "Batman", "Superman", "Iron Man"] },
  { cat: "entretenimiento", q: "¿En qué ciudad viven Los Simpson?", a: ["Springfield", "Shelbyville", "Quahog", "South Park"] },
  { cat: "entretenimiento", q: "¿Qué princesa de Disney pierde un zapato de cristal?", a: ["Cenicienta", "Blancanieves", "Aurora", "Bella"] },
  { cat: "entretenimiento", q: "¿Quién es el villano de casco negro de la primera trilogía de Star Wars?", a: ["Darth Vader", "Darth Maul", "Kylo Ren", "Boba Fett"] },
  { cat: "entretenimiento", q: "¿Qué cantante colombiana canta «Hips Don't Lie»?", a: ["Shakira", "Karol G", "Thalía", "Jennifer Lopez"] },
  { cat: "entretenimiento", q: "¿En qué serie son amigos Ross, Rachel y Monica?", a: ["Friends", "How I Met Your Mother", "Seinfeld", "The Office"] },
  { cat: "entretenimiento", q: "¿Cómo se llama el pez payaso que se pierde en la película de Pixar?", a: ["Nemo", "Dory", "Marlin", "Bruce"] },
  { cat: "entretenimiento", q: "¿Qué personaje dice «¡Hasta el infinito y más allá!»?", a: ["Buzz Lightyear", "Woody", "Rayo McQueen", "Mike Wazowski"] },
  { cat: "entretenimiento", q: "¿Qué banda formaban John, Paul, George y Ringo?", a: ["The Beatles", "The Rolling Stones", "Queen", "The Who"] },
  { cat: "entretenimiento", q: "¿Qué personaje de historieta argentina odia la sopa?", a: ["Mafalda", "Isidoro Cañones", "Patoruzú", "Gaturro"] },
  { cat: "entretenimiento", q: "¿Cómo se llama el plomero más famoso de Nintendo?", a: ["Mario", "Link", "Wario", "Kirby"] },
  { cat: "entretenimiento", q: "¿En qué saga aparece el Anillo Único?", a: ["El Señor de los Anillos", "Harry Potter", "Las crónicas de Narnia", "Game of Thrones"] },
  { cat: "entretenimiento", q: "¿Qué película argentina ganó el Oscar a mejor película extranjera en 2010?", a: ["El secreto de sus ojos", "Relatos salvajes", "Nueve reinas", "La historia oficial"] },
  { cat: "entretenimiento", q: "¿Qué serie española trata de un atraco a la Fábrica Nacional de Moneda y Timbre?", a: ["La casa de papel", "Élite", "Vis a vis", "El ministerio del tiempo"] },
  { cat: "entretenimiento", q: "¿De qué color es Pikachu?", a: ["Amarillo", "Rojo", "Azul", "Verde"] },
  { cat: "entretenimiento", q: "¿Cómo se llama el muñeco de nieve de Frozen?", a: ["Olaf", "Sven", "Kristoff", "Hans"] },
  { cat: "entretenimiento", q: "¿A quién llaman «el Rey del Pop»?", a: ["Michael Jackson", "Elvis Presley", "Prince", "Freddie Mercury"] },

  // Arte y literatura
  { cat: "arte", q: "¿Quién pintó la Mona Lisa?", a: ["Leonardo da Vinci", "Miguel Ángel", "Rafael", "Botticelli"] },
  { cat: "arte", q: "¿Quién escribió «Don Quijote de la Mancha»?", a: ["Miguel de Cervantes", "Lope de Vega", "Francisco de Quevedo", "Federico García Lorca"] },
  { cat: "arte", q: "¿Quién escribió «Cien años de soledad»?", a: ["Gabriel García Márquez", "Mario Vargas Llosa", "Julio Cortázar", "Isabel Allende"] },
  { cat: "arte", q: "¿Quién pintó «La noche estrellada»?", a: ["Vincent van Gogh", "Claude Monet", "Pablo Picasso", "Salvador Dalí"] },
  { cat: "arte", q: "¿Quién escribió el «Martín Fierro»?", a: ["José Hernández", "Jorge Luis Borges", "Domingo F. Sarmiento", "Leopoldo Lugones"] },
  { cat: "arte", q: "¿Quién pintó el techo de la Capilla Sixtina?", a: ["Miguel Ángel", "Leonardo da Vinci", "Rafael", "Caravaggio"] },
  { cat: "arte", q: "¿Quién escribió «Romeo y Julieta»?", a: ["William Shakespeare", "Charles Dickens", "Oscar Wilde", "Molière"] },
  { cat: "arte", q: "¿Qué pintor es famoso por sus relojes derretidos?", a: ["Salvador Dalí", "Joan Miró", "René Magritte", "Frida Kahlo"] },
  { cat: "arte", q: "¿Quién escribió «El principito»?", a: ["Antoine de Saint-Exupéry", "Julio Verne", "Victor Hugo", "Albert Camus"] },
  { cat: "arte", q: "¿Qué pintora mexicana es famosa por sus autorretratos?", a: ["Frida Kahlo", "Remedios Varo", "Leonora Carrington", "Tina Modotti"] },
  { cat: "arte", q: "¿Quién escribió «Rayuela»?", a: ["Julio Cortázar", "Jorge Luis Borges", "Ernesto Sabato", "Adolfo Bioy Casares"] },
  { cat: "arte", q: "¿Qué compositor siguió componiendo sordo, incluida su Novena Sinfonía?", a: ["Ludwig van Beethoven", "Wolfgang Amadeus Mozart", "Johann Sebastian Bach", "Frédéric Chopin"] },
  { cat: "arte", q: "¿Quién pintó el «Guernica»?", a: ["Pablo Picasso", "Salvador Dalí", "Francisco de Goya", "Diego Velázquez"] },
  { cat: "arte", q: "¿A quién se le atribuye «La Odisea»?", a: ["Homero", "Virgilio", "Sófocles", "Platón"] },
  { cat: "arte", q: "¿Qué poeta chileno ganó el Premio Nobel de Literatura en 1971?", a: ["Pablo Neruda", "Gabriela Mistral", "Vicente Huidobro", "Nicanor Parra"] },
  { cat: "arte", q: "¿En qué museo se exhibe la Mona Lisa?", a: ["El Louvre", "El Prado", "El Museo Británico", "La Galería Uffizi"] },
  { cat: "arte", q: "¿Quién escribió «El Aleph»?", a: ["Jorge Luis Borges", "Julio Cortázar", "Ernesto Sabato", "Macedonio Fernández"] },
  { cat: "arte", q: "¿Qué baile nació en el Río de la Plata?", a: ["El tango", "La salsa", "El flamenco", "La cumbia"] },
  { cat: "arte", q: "¿Quién compuso «Las cuatro estaciones»?", a: ["Antonio Vivaldi", "Wolfgang Amadeus Mozart", "Johann Sebastian Bach", "Georg Friedrich Händel"] },
  { cat: "arte", q: "¿Quién esculpió «El pensador»?", a: ["Auguste Rodin", "Miguel Ángel", "Gian Lorenzo Bernini", "Donatello"] },
];
