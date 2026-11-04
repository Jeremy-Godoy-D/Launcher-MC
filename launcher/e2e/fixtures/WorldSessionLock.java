import java.nio.channels.FileChannel;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

class WorldSessionLock {
    public static void main(String[] args) throws Exception {
        try (var channel = FileChannel.open(Path.of(args[0]), StandardOpenOption.CREATE,
                StandardOpenOption.READ, StandardOpenOption.WRITE);
             var lock = channel.tryLock()) {
            System.out.println(lock == null ? "BUSY" : "LOCKED");
            System.out.flush();
            if (lock != null && args[1].equals("hold")) System.in.read();
        }
    }
}
